import { Injectable, Logger } from '@nestjs/common';
import type { ContentItemCandidate, PlanNoteCode, StudyPlanOrigin } from '@english-quest/shared';

import { ContentBankService } from '../content/content-bank.service';
import { CredentialsService } from '../credentials/credentials.service';
import { ContentGenerationService } from '../generation/content-generation.service';
import { classifyGenerationError } from '../generation/generation-error';
import type { GenerationRunResult } from '../generation/generation.contract';
import { ErrorLedgerReader } from '../profile/error-ledger.reader';
import { ProfileSummaryService } from '../profile/profile-summary.service';
import { PromptExecutionService } from '../prompts/prompt-execution.service';
import { ErrorTaxonomyService } from '../taxonomy/error-taxonomy.service';
import { buildComposePromptVariables } from './compose-prompt-variables';
import { buildOffer, rankCandidates, type RankingContext } from './composition/candidate-ranking';
import type { ModelOutput, SelectionStats, ValidatedSelection } from './composition/model-selection';
import { validateSelection } from './composition/model-selection';
import type { RationaleContext } from './composition/rationale';
import { rankPlanTags, type RankedPlanTag } from './composition/tag-priority';
import type { ComposedSelection } from './composition/plan-selection';
import { selectPlan } from './composition/plan-selection';
import { PlanRulesService } from './plan-rules.service';
import type { StudyPlanRules } from './rules/plan-rules';

export type DeterministicReason =
  | 'gemini_key_missing'
  | 'gemini_key_rejected'
  | 'gemini_quota_exhausted'
  | 'model_call_failed'
  | 'model_output_invalid'
  | 'no_profile';

export interface ComposeRequest {
  userId: string;
  lessonId: string;
  origin: StudyPlanOrigin;
  now: Date;
  onProgress?: (done: number, total: number) => void | Promise<void>;
}

export interface ComposedPlan {
  origin: StudyPlanOrigin;
  lessonId: string;
  composition: 'model' | 'deterministic';
  deterministicReason: DeterministicReason | null;
  generalMaterial: boolean;
  promptId: string | null;
  promptVersion: string | null;
  model: string | null;
  generationRunId: string | null;
  modelSelectionStats: SelectionStats | null;
  rulesVersion: string;
  rulesFingerprint: string;
  taxonomyVersion: string;
  selection: ComposedSelection;
  tagPriority: ReadonlyMap<string, RankedPlanTag>;
  /** For the packer (needs the same rules the selection was built under) and for carry-over's rationale. */
  rules: StudyPlanRules;
  rationaleCtx: RationaleContext;
}

const BANK_TYPES = ['listening', 'reading', 'vocabulary', 'grammar', 'error_review'] as const;

/** Capitalisation the taxonomy's own labels never carry; a phoneme label (`/θ/`) is left untouched. */
function lowerFirst(text: string): string {
  return text.length > 0 ? text[0]!.toLowerCase() + text.slice(1) : text;
}

/**
 * Builds one plan's content: runs F14's generation batch (unless the
 * origin, general mode or the key rules it out), asks `study-plan-compose`
 * for an ordered selection on the owner's own key, and falls back to the
 * deterministic guardrails alone whenever the model path is unavailable or
 * unusable (spec §5 "The composition algorithm"). Writes nothing — F15's
 * activation service persists the result it returns.
 */
@Injectable()
export class PlanComposerService {
  private readonly logger = new Logger(PlanComposerService.name);

  constructor(
    private readonly ledger: ErrorLedgerReader,
    private readonly profileSummary: ProfileSummaryService,
    private readonly content: ContentBankService,
    private readonly generation: ContentGenerationService,
    private readonly promptExecution: PromptExecutionService,
    private readonly credentials: CredentialsService,
    private readonly taxonomy: ErrorTaxonomyService,
    private readonly planRules: PlanRulesService,
  ) {}

  async compose(request: ComposeRequest): Promise<ComposedPlan> {
    const { userId, lessonId, origin, now, onProgress } = request;
    const loadedRules = this.planRules.current();
    const rules = loadedRules.rules;
    const taxonomyVersion = this.taxonomy.current().version;

    const [unmasteredTags, entries, recurringEntries, dueEntries, credentials] = await Promise.all([
      this.ledger.unmasteredTags(userId),
      this.ledger.entriesFor(userId, { includeRetired: false }),
      this.ledger.recurringFor(userId, now),
      this.ledger.dueEntries(userId, now),
      this.credentials.list(userId),
    ]);
    const generalMode = unmasteredTags.length === 0;
    const sightings = await this.ledger.lessonSightings(
      userId,
      entries.map((entry) => entry.tag),
      5,
    );

    const tagPriority = new Map(
      rankPlanTags({
        unmasteredTags,
        entries: entries.map((entry) => ({
          tag: entry.tag,
          family: entry.family,
          occurrenceCount: entry.occurrenceCount,
          lastSeenAt: entry.lastSeenAt,
          dueAt: entry.dueAt,
        })),
        recurringTags: recurringEntries.map((entry) => entry.tag),
        due: dueEntries.map((entry) => ({
          tag: entry.tag,
          family: entry.family,
          occurrenceCount: entry.occurrenceCount,
          lastSeenAt: entry.lastSeenAt,
          dueAt: entry.dueAt,
        })),
        sightings,
      }).map((tag): [string, RankedPlanTag] => [tag.tag, tag]),
    );

    const labelOf = (tag: string): string => {
      const label = this.taxonomy.labelOf(tag);
      return this.taxonomy.familyOf(tag) === 'phoneme' ? label : lowerFirst(label);
    };
    const rationaleCtx: RationaleContext = { labelOf };

    const gemini = credentials.find((credential) => credential.provider === 'gemini');
    const keyUsable = !!gemini && gemini.status !== 'missing' && gemini.status !== 'invalid';

    let deterministicReason: DeterministicReason | null = null;
    if (origin === 'analysis_blocked') {
      deterministicReason = 'gemini_key_missing';
    } else if (generalMode) {
      deterministicReason = 'no_profile';
    } else if (!keyUsable) {
      deterministicReason = 'gemini_key_missing';
    }

    let generationResult: GenerationRunResult | null = null;
    const shouldGenerate = origin !== 'analysis_blocked' && !generalMode && keyUsable;
    if (shouldGenerate) {
      const runKey = origin === 'lesson' ? `lesson:${lessonId}` : `fallback:${lessonId}`;
      generationResult = await this.generation.generateForPlan({
        userId,
        runKey,
        maxItems: rules.generation.maxItems,
        now,
        onProgress,
      });
      if (generationResult.abandonReason === 'credential_missing') {
        deterministicReason = 'gemini_key_missing';
      } else if (generationResult.abandonReason === 'credential_rejected') {
        deterministicReason = 'gemini_key_rejected';
      } else if (generationResult.abandonReason === 'quota_exhausted') {
        deterministicReason = 'gemini_quota_exhausted';
      }
    }

    const generatedItemIds = new Set(
      (generationResult?.slots ?? [])
        .filter((slot) => slot.outcome === 'generated' || slot.outcome === 'fallback')
        .map((slot) => slot.contentItemId)
        .filter((id): id is string => id !== null),
    );

    const pool = await this.buildPool(userId, rules, generatedItemIds);
    const ctx: RankingContext = {
      unmasteredTags: new Set(unmasteredTags),
      tagPriority,
      cefrLevels: rules.candidates.cefrLevels,
      generalMode,
    };
    const ranked = rankCandidates(pool, generatedItemIds, ctx);

    let composition: 'model' | 'deterministic' = 'deterministic';
    let validated: ValidatedSelection | null = null;
    let promptStamp: { promptId: string; promptVersion: string; model: string } | null = null;
    let modelSelectionStats: SelectionStats | null = null;

    const shouldCallModel = deterministicReason === null;
    if (shouldCallModel) {
      const offer = buildOffer(ranked, generatedItemIds, rules);
      try {
        const summary = await this.profileSummary.compactSummaryFor(userId, now);
        const variables = buildComposePromptVariables({ profileSummary: summary.text, tagPriority, labelOf, offer, rules });
        const result = await this.promptExecution.execute(userId, 'study-plan-compose', variables);
        validated = validateSelection(result.data as ModelOutput, offer, ctx, rules);
        modelSelectionStats = validated.stats;
        if (validated.discard) {
          deterministicReason = 'model_output_invalid';
          this.logger.warn(
            `study-plan-compose output discarded for user ${userId} (prompt ${result.promptId}@${result.promptVersion}): ` +
              `${validated.stats.rejected.unknown + validated.stats.rejected.duplicate + validated.stats.rejected.offTarget} of ${validated.stats.returned} entries rejected`,
          );
        } else {
          composition = 'model';
          promptStamp = { promptId: result.promptId, promptVersion: result.promptVersion, model: result.model };
        }
      } catch (error) {
        const classified = classifyGenerationError(error);
        if (classified.outcome === 'credential_missing') {
          deterministicReason = 'gemini_key_missing';
        } else if (classified.outcome === 'credential_rejected') {
          deterministicReason = 'gemini_key_rejected';
        } else if (classified.outcome === 'quota_exhausted') {
          deterministicReason = 'gemini_quota_exhausted';
        } else {
          deterministicReason = 'model_call_failed';
        }
        this.logger.warn(`study-plan-compose call failed for user ${userId}, composing deterministically: ${classified.outcome}`);
      }
    }

    const selection = selectPlan({ rankedPool: ranked, ctx, rules, rationaleCtx }, composition === 'model' ? validated : null);

    return {
      origin,
      lessonId,
      composition,
      deterministicReason: composition === 'deterministic' ? (deterministicReason ?? 'no_profile') : null,
      generalMaterial: generalMode,
      promptId: promptStamp?.promptId ?? null,
      promptVersion: promptStamp?.promptVersion ?? null,
      model: promptStamp?.model ?? null,
      generationRunId: generationResult?.runId ?? null,
      modelSelectionStats,
      rulesVersion: loadedRules.version,
      rulesFingerprint: loadedRules.fingerprint,
      taxonomyVersion,
      selection,
      tagPriority,
      rules,
      rationaleCtx,
    };
  }

  /** Metadata for every eligible bank item, plus this run's F14 items (even if a served-window exclusion would otherwise hide them). */
  private async buildPool(
    userId: string,
    rules: StudyPlanRules,
    generatedItemIds: ReadonlySet<string>,
  ): Promise<ContentItemCandidate[]> {
    const [bankCandidates, generatedCandidates] = await Promise.all([
      this.content.findCandidates({
        userId,
        types: [...BANK_TYPES],
        cefrLevels: rules.candidates.cefrLevels,
        limit: 500,
      }),
      generatedItemIds.size > 0 ? this.content.candidatesFor([...generatedItemIds]) : Promise.resolve([]),
    ]);
    const byId = new Map<string, ContentItemCandidate>();
    for (const candidate of [...bankCandidates, ...generatedCandidates]) {
      byId.set(candidate.id, candidate);
    }
    return [...byId.values()];
  }
}

/**
 * The user-facing note a composed plan's `deterministicReason` earns, per
 * spec A15's notes table. `model_call_failed` and `model_output_invalid`
 * earn none — the underlying key is fine, the guardrails alone produced a
 * perfectly good plan, and there is nothing actionable to tell the user.
 * `no_profile` earns none either; that state is `generalMaterial`'s note.
 */
export function deterministicNoteCode(reason: DeterministicReason | null): PlanNoteCode | null {
  switch (reason) {
    case 'gemini_key_missing':
    case 'gemini_key_rejected':
      return 'gemini_key_missing';
    case 'gemini_quota_exhausted':
      return 'gemini_quota_exhausted';
    default:
      return null;
  }
}
