import { Injectable, Logger } from '@nestjs/common';
import { vocabularyDomainSchema, type GeneratedContentType } from '@english-quest/shared';
import type { ContentGenerationSlot } from '@prisma/client';

import { AppError } from '../common/app-error';
import { CredentialsService } from '../credentials/credentials.service';
import { ErrorLedgerReader } from '../profile/error-ledger.reader';
import { PromptRegistryService } from '../prompts/prompt-registry.service';
import { ErrorTaxonomyService } from '../taxonomy/error-taxonomy.service';
import { FrequencyListService } from './frequency-list.service';
import { GENERATION_NOTES, GENERATION_PROMPT_IDS, SLOT_CONCURRENCY, SLOT_LEASE_MS } from './generation.constants';
import {
  generationRequestSchema,
  type GenerationRequest,
  type GenerationRunResult,
  type GenerationSlotResult,
  type PlannedSlotPreview,
  type SlotOutcome,
} from './generation.contract';
import type { AbandonReason } from './generation-error';
import { GenerationRulesService } from './generation-rules.service';
import { GenerationRunRepository, type GenerationNote, type RunWithSlots } from './generation-run.repository';
import { planBatch } from './planning/batch-planner';
import type { Rng } from './planning/genre-picker';
import { decorateSlots, type PlannedSlot } from './planning/slot-decorations';
import { rankTags } from './planning/tag-ranking';
import { SlotGeneratorService, type RunContext } from './slot-generator.service';

const TERMINAL_STATUSES = new Set(['generated', 'fallback', 'dropped']);

function notesFor(reason: AbandonReason | null): GenerationNote[] {
  switch (reason) {
    case 'credential_missing':
    case 'credential_rejected':
      return [{ code: 'gemini_key_missing', text: GENERATION_NOTES.gemini_key_missing }];
    case 'quota_exhausted':
      return [{ code: 'gemini_quota_exhausted', text: GENERATION_NOTES.gemini_quota_exhausted }];
    default:
      return [];
  }
}

function toSlotResult(slot: ContentGenerationSlot): GenerationSlotResult {
  return {
    position: slot.position,
    type: slot.type as GeneratedContentType,
    targetTags: slot.targetTags,
    outcome: slot.status as SlotOutcome,
    contentItemId: slot.contentItemId,
    reason: slot.reason as GenerationSlotResult['reason'],
    attempts: slot.attemptCount,
    genre: slot.genre,
    tagSources: slot.tagSources as GenerationSlotResult['tagSources'],
  };
}

function toResult(run: RunWithSlots): GenerationRunResult {
  const slots = run.slots.map(toSlotResult);
  const count = (outcome: SlotOutcome) => slots.filter((slot) => slot.outcome === outcome).length;
  return {
    runId: run.id,
    runKey: run.runKey,
    abandonReason: run.abandonReason as GenerationRunResult['abandonReason'],
    slots,
    counts: { planned: slots.length, generated: count('generated'), fallback: count('fallback'), dropped: count('dropped') },
    notes: run.notes as unknown as GenerationRunResult['notes'],
  };
}

/**
 * AI content generation with the difficulty gate (PRD F14): the one entry
 * point F15 calls once per study plan, and the curator's CLI with it.
 *
 * A run is idempotent per (user, run key): the plan is made once and
 * persisted, slots are claimed atomically, and a second call either returns
 * the finished run without calling the model or resumes an unfinished one.
 * Every call runs on the owner's own Gemini key and reads only the owner's
 * ledger. Expected states (no key, quota, a failing item) come back in the
 * result; only a caller bug (`VAL001`) or an infrastructure fault throws.
 */
@Injectable()
export class ContentGenerationService {
  private readonly logger = new Logger(ContentGenerationService.name);

  constructor(
    private readonly repository: GenerationRunRepository,
    private readonly slots: SlotGeneratorService,
    private readonly ledger: ErrorLedgerReader,
    private readonly credentials: CredentialsService,
    private readonly registry: PromptRegistryService,
    private readonly rules: GenerationRulesService,
    private readonly frequencyList: FrequencyListService,
    private readonly taxonomy: ErrorTaxonomyService,
  ) {}

  /** Randomness for genres and topic domains; replaceable in tests. */
  rng: Rng = Math.random;

  async generateForPlan(request: GenerationRequest): Promise<GenerationRunResult> {
    const parsed = generationRequestSchema.safeParse({
      userId: request.userId,
      runKey: request.runKey,
      maxItems: request.maxItems,
    });
    if (!parsed.success) {
      throw AppError.validationFailed(
        parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      );
    }
    const { userId, runKey, maxItems } = parsed.data;
    const now = (): Date => request.now ?? new Date();

    const existing = await this.repository.findRun(userId, runKey);
    if (existing?.status === 'completed') {
      return toResult(existing);
    }

    const run = existing ?? (await this.createRun(userId, runKey, maxItems, now()));
    const context: RunContext = {
      runId: run.id,
      userId,
      unmastered: new Set(await this.ledger.unmasteredTags(userId)),
      usedFallbacks: new Set(run.slots.filter((slot) => slot.status === 'fallback' && slot.contentItemId).map((slot) => slot.contentItemId!)),
      abandoned: run.abandonReason as AbandonReason | null,
      now,
    };

    const total = run.slots.length;
    let done = run.slots.filter((slot) => TERMINAL_STATUSES.has(slot.status)).length;
    const report = async (): Promise<void> => {
      done += 1;
      try {
        await request.onProgress?.(done, total);
      } catch (error) {
        this.logger.warn(`onProgress failed for run ${run.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    const worker = async (): Promise<void> => {
      for (;;) {
        const slot = await this.repository.claimNextSlot(run.id, now(), SLOT_LEASE_MS);
        if (!slot) {
          return;
        }
        await this.slots.generate(slot, context);
        await report();
      }
    };
    await Promise.all(Array.from({ length: Math.min(SLOT_CONCURRENCY, Math.max(total, 1)) }, worker));

    const settled = await this.repository.runById(run.id);
    if (settled.slots.some((slot) => !TERMINAL_STATUSES.has(slot.status))) {
      // Another worker still holds a slot (a concurrent call on the same key): report the run as it stands.
      return toResult(settled);
    }
    const reason = (settled.abandonReason as AbandonReason | null) ?? context.abandoned;
    await this.repository.finishRun(run.id, notesFor(reason), now());
    return toResult(await this.repository.runById(run.id));
  }

  /** The plan a run would make now, genres and exemplars included, without persisting anything or calling the model. */
  async previewPlan(userId: string, options: { maxItems?: number } = {}): Promise<PlannedSlotPreview[]> {
    const maxItems = generationRequestSchema.shape.maxItems.parse(options.maxItems);
    const planned = await this.plan(userId, maxItems, new Date());
    return planned.map(({ position, type, targetTags, tagSources, genre, topicDomain, exemplarIndex }) => ({
      position,
      type,
      targetTags,
      tagSources,
      genre,
      topicDomain,
      exemplarIndex,
    }));
  }

  /** A run as it stands, without running it. */
  async resultFor(userId: string, runKey: string): Promise<GenerationRunResult | null> {
    const run = await this.repository.findRun(userId, runKey);
    return run ? toResult(run) : null;
  }

  private async createRun(userId: string, runKey: string, maxItems: number, now: Date): Promise<RunWithSlots> {
    const planned = await this.plan(userId, maxItems, now);
    const rules = this.rules.current();
    const gemini = (await this.credentials.list(userId)).find((credential) => credential.provider === 'gemini');
    // `invalid` covers a key the provider rejected and one that could not be decrypted (F02).
    const unusable = !gemini || gemini.status === 'missing' || gemini.status === 'invalid';
    return this.repository.createRun({
      userId,
      runKey,
      maxItems,
      versions: {
        rulesVersion: rules.version,
        rulesFingerprint: rules.fingerprint,
        frequencyListVersion: this.frequencyList.current().version,
        taxonomyVersion: this.taxonomy.current().version,
      },
      slots: planned,
      abandonReason: unusable && planned.length > 0 ? 'credential_missing' : null,
    });
  }

  /** Ranks the owner's tags and plans the batch (spec A7–A9, A14–A16). Reads only the owner's ledger. */
  private async plan(userId: string, maxItems: number, now: Date): Promise<PlannedSlot[]> {
    const taxonomy = this.taxonomy.current();
    const rules = this.rules.current().rules;
    const [unmasteredTags, entries, recurring, due] = await Promise.all([
      this.ledger.unmasteredTags(userId),
      this.ledger.entriesFor(userId, { includeRetired: false, now }),
      this.ledger.recurringFor(userId, now),
      this.ledger.dueEntries(userId, now),
    ]);
    const quoted = await this.ledger.latestExamples(userId, unmasteredTags);
    const ranked = rankTags({
      unmasteredTags,
      entries,
      recurringTags: recurring.map((entry) => entry.tag),
      due,
      quotedTags: new Set(quoted.filter((example) => example.quote).map((example) => example.tag)),
      eligibleFamilies: new Set(taxonomy.families.filter((family) => family.analysis).map((family) => family.id)),
    });
    const drafts = planBatch({
      ranked,
      maxItems,
      mix: rules.batch.mix,
      maxItemsPerTag: rules.batch.maxItemsPerTag,
      tagsPerItem: {
        reading: rules.itemTypes.reading.targetTags,
        vocabulary: rules.itemTypes.vocabulary.targetTags,
        grammar: rules.itemTypes.grammar.targetTags,
        error_review: rules.itemTypes.error_review.targetTags,
      },
    });
    if (drafts.length === 0) {
      return [];
    }
    const [genreHistory, priorSlotsByType] = await Promise.all([
      this.repository.readingGenreHistory(userId),
      this.repository.slotCountsByType(userId),
    ]);
    const exemplarCounts = Object.fromEntries(
      (Object.entries(GENERATION_PROMPT_IDS) as Array<[GeneratedContentType, string]>).map(([type, id]) => [
        type,
        this.registry.get(id).examples.length,
      ]),
    ) as Record<GeneratedContentType, number>;
    return decorateSlots(drafts, {
      genreHistory,
      genres: rules.genres,
      domains: vocabularyDomainSchema.options,
      exemplarCounts,
      priorSlotsByType,
      rng: this.rng,
    });
  }
}
