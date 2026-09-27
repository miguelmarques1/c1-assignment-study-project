import { Injectable, Logger } from '@nestjs/common';
import type { GeneratedContentType } from '@english-quest/shared';
import type { ContentGenerationSlot } from '@prisma/client';

import { ContentBankService } from '../content/content-bank.service';
import { ErrorLedgerReader } from '../profile/error-ledger.reader';
import { PromptExecutionService } from '../prompts/prompt-execution.service';
import { PromptRegistryService } from '../prompts/prompt-registry.service';
import { ErrorTaxonomyService } from '../taxonomy/error-taxonomy.service';
import { selectCuratedFallback } from './curated-fallback';
import { FrequencyListService } from './frequency-list.service';
import { evaluateGate } from './gate/difficulty-gate';
import { renderGateFeedback } from './gate/gate-feedback';
import { mapGeneratedOutput } from './generated-item.mapper';
import { GENERATION_PROMPT_IDS } from './generation.constants';
import type { SlotSpec } from './generation.contract';
import { classifyGenerationError, type AbandonReason } from './generation-error';
import { GenerationRulesService } from './generation-rules.service';
import { GenerationRunRepository, type RecordedAttempt, type SlotReason } from './generation-run.repository';
import { buildPromptVariables, type LearnerError } from './prompt-variables';

/** The PRD's "regenerated exactly once": the original attempt and one regeneration. */
export const MAX_ATTEMPTS_PER_SLOT = 2;

/** Up to five of the tag's examples reach an error-review prompt (spec A7). */
const MAX_LEARNER_ERRORS = 5;

/** What one run shares between its concurrent slots. */
export interface RunContext {
  runId: string;
  userId: string;
  /** The owner's unmastered tags when the run started, for ranking fallbacks. */
  unmastered: ReadonlySet<string>;
  /** Curated items already standing in for a slot of this run. */
  usedFallbacks: Set<string>;
  /** Set once the run must stop calling the model; read before every call. */
  abandoned: AbandonReason | null;
  now(): Date;
}

@Injectable()
export class SlotGeneratorService {
  private readonly logger = new Logger(SlotGeneratorService.name);

  constructor(
    private readonly prompts: PromptExecutionService,
    private readonly registry: PromptRegistryService,
    private readonly bank: ContentBankService,
    private readonly repository: GenerationRunRepository,
    private readonly ledger: ErrorLedgerReader,
    private readonly rules: GenerationRulesService,
    private readonly frequencyList: FrequencyListService,
    private readonly taxonomy: ErrorTaxonomyService,
  ) {}

  /**
   * Takes one claimed slot to a terminal state: a generated item, a curated
   * fallback, or dropped. Attempts continue from those already recorded, so
   * a resumed slot never gets a third. A run-ending error (no key, rejected
   * key, quota) is recorded against the attempt and marks the run, and the
   * slot falls back without another call.
   */
  async generate(slot: ContentGenerationSlot, run: RunContext): Promise<void> {
    const type = slot.type as GeneratedContentType;
    const promptId = GENERATION_PROMPT_IDS[type];
    const recorded = await this.repository.attemptsFor(slot.id);
    const learnerErrors = type === 'error_review' ? await this.learnerErrorsFor(run.userId, slot.targetTags[0]!) : [];

    for (let attempt = recorded.length + 1; attempt <= MAX_ATTEMPTS_PER_SLOT && !run.abandoned; attempt += 1) {
      const spec: SlotSpec = {
        slotId: slot.id,
        type,
        targetTags: slot.targetTags,
        attempt,
        genre: slot.genre,
        topicDomain: slot.topicDomain,
        exemplarIndex: slot.exemplarIndex,
      };
      const passed = await this.attempt(spec, promptId, learnerErrors, recorded, run);
      if (passed) {
        return;
      }
    }
    await this.fallBack(slot, type, recorded, run);
  }

  /** One model call and its verdict. Returns true when the item passed and was saved. */
  private async attempt(
    spec: SlotSpec,
    promptId: string,
    learnerErrors: readonly LearnerError[],
    recorded: RecordedAttempt[],
    run: RunContext,
  ): Promise<boolean> {
    const loadedRules = this.rules.current();
    const taxonomy = this.taxonomy.current();
    const input = buildPromptVariables(spec, loadedRules.rules, taxonomy, learnerErrors);
    const previous = recorded.at(-1);
    const appendix = previous?.outcome === 'gate_failed' ? renderGateFeedback(previous.failures) : undefined;
    const promptVersion = this.registry.get(promptId).version;
    const startedAt = Date.now();

    let result;
    try {
      result = await this.prompts.execute(run.userId, promptId, input.variables, {
        exampleIndexes: [spec.exemplarIndex],
        appendix,
      });
    } catch (error) {
      const classified = classifyGenerationError(error);
      await this.repository.recordAttempt(spec.slotId, {
        attempt: spec.attempt,
        promptId,
        promptVersion,
        outcome: classified.outcome,
        errorDetail: classified.detail,
        latencyMs: Date.now() - startedAt,
      });
      recorded.push({ attempt: spec.attempt, outcome: classified.outcome, failedChecks: [], failures: [] });
      if (classified.scope === 'run') {
        run.abandoned ??= classified.outcome;
        await this.repository.markAbandoned(run.runId, classified.outcome);
      }
      return false;
    }

    const latencyMs = Date.now() - startedAt;
    const stamp = { promptId: result.promptId, promptVersion: result.promptVersion };
    const mapped = mapGeneratedOutput(result.data, spec, stamp, loadedRules.rules, taxonomy);
    const report = evaluateGate(mapped, {
      slot: spec,
      rules: loadedRules,
      frequencyList: this.frequencyList.current(),
      taxonomy,
      promptBannedPhrases: this.registry.get(promptId).bannedPhrases,
      learnerQuotes: input.learnerQuotes,
    });

    if (report.passed && report.item) {
      const saved = await this.bank.saveGenerated(report.item);
      await this.repository.recordPass(
        spec.slotId,
        { attempt: spec.attempt, ...stamp, outcome: 'passed', gateMetrics: report.metrics, latencyMs },
        saved.id,
        run.now(),
      );
      return true;
    }

    await this.repository.recordAttempt(spec.slotId, {
      attempt: spec.attempt,
      ...stamp,
      outcome: 'gate_failed',
      failedChecks: report.failedChecks,
      gateMetrics: { ...report.metrics, failures: report.failures },
      latencyMs,
    });
    recorded.push({ attempt: spec.attempt, outcome: 'gate_failed', failedChecks: report.failedChecks, failures: report.failures });
    return false;
  }

  /**
   * The slot's item could not be generated: log why (prompt version and the
   * measured values, never the text), then stand a curated item of the same
   * type in, or drop the slot when the bank has none (PRD F14).
   */
  private async fallBack(slot: ContentGenerationSlot, type: GeneratedContentType, recorded: RecordedAttempt[], run: RunContext): Promise<void> {
    const reason: SlotReason =
      run.abandoned ?? (recorded.length > 0 && recorded.every((entry) => entry.outcome === 'gate_failed') ? 'gate_failed_twice' : 'generation_failed');

    if (recorded.length > 0) {
      const promptId = GENERATION_PROMPT_IDS[type];
      const summary = recorded
        .map((entry) => `attempt ${entry.attempt}: ${entry.outcome}${entry.failedChecks.length ? ` (${entry.failedChecks.join(', ')})` : ''}`)
        .join('; ');
      this.logger.warn(
        `Discarded ${type} slot ${slot.position} of run ${run.runId} under ${promptId} v${this.registry.get(promptId).version}: ${summary}`,
      );
    }

    const fallbackId = await selectCuratedFallback(this.bank, run.userId, { type, targetTags: slot.targetTags }, run.unmastered, run.usedFallbacks);
    if (fallbackId) {
      run.usedFallbacks.add(fallbackId);
      await this.repository.completeSlot(slot.id, { status: 'fallback', contentItemId: fallbackId, reason }, run.now());
    } else {
      await this.repository.completeSlot(slot.id, { status: 'dropped', reason }, run.now());
    }
  }

  /**
   * The owner's own quoted mistakes on an error-review tag, newest first.
   * Only this user's ledger is read, and only for a prompt that runs under
   * this user's key; the gate refuses any item that reproduces them.
   */
  private async learnerErrorsFor(userId: string, tag: string): Promise<LearnerError[]> {
    const [entry] = await this.ledger.entriesFor(userId, { tags: [tag], includeRetired: false });
    if (!entry) {
      return [];
    }
    const detail = await this.ledger.detailFor(userId, entry.id);
    return (detail?.examples ?? [])
      .flatMap((example) => (example.quote ? [{ quote: example.quote, correction: example.correction }] : []))
      .slice(0, MAX_LEARNER_ERRORS);
  }
}
