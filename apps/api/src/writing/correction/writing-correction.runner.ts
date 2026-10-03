import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { WritingFailureCode } from '@english-quest/shared';
import type { WritingTask } from '@prisma/client';

import { PlanActivityStateService } from '../../plans/plan-activity-state.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ErrorLedgerReader } from '../../profile/error-ledger.reader';
import { ProfileIngestionService } from '../../profile/profile-ingestion.service';
import { PromptExecutionService } from '../../prompts/prompt-execution.service';
import { PromptRegistryService } from '../../prompts/prompt-registry.service';
import { ErrorTaxonomyService } from '../../taxonomy/error-taxonomy.service';
import { buildCorrectionPromptVariables, type TaxonomyTagEntry } from './correction-prompt-variables';
import { classifyCorrectionError } from './correction-error';
import { toActivityOutcome } from './correction-outcome';
import { processCorrectionOutput, type RawCorrectionError } from '../output/writing-output';
import {
  WRITING_DEFAULT_OPTIONS,
  WRITING_FAILURE_STATUS,
  WRITING_OPTIONS,
  WRITING_PROMPT_ID,
  type WritingOptions,
} from '../writing.constants';
import { WritingRepository } from '../writing.repository';

interface RawWritingCorrectionResponse {
  overall_comment: string;
  scores: { grammar: number; vocabulary: number; coherence: number; task_achievement: number };
  errors: RawCorrectionError[];
  revised_text: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs one writing correction on the task owner's own Gemini key (spec §5).
 * Up to two requests, with the retry delay between them; a key failure or
 * invalid output never retries (A11). Never throws — a crash is logged and
 * leaves the correction `running` for the sweep to reclaim, exactly like an
 * API restart would.
 */
@Injectable()
export class WritingCorrectionRunner {
  private readonly logger = new Logger(WritingCorrectionRunner.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: WritingRepository,
    private readonly promptExecution: PromptExecutionService,
    private readonly promptRegistry: PromptRegistryService,
    private readonly taxonomy: ErrorTaxonomyService,
    private readonly ledger: ErrorLedgerReader,
    private readonly profileIngestion: ProfileIngestionService,
    private readonly plans: PlanActivityStateService,
    @Optional() @Inject(WRITING_OPTIONS) private readonly options: WritingOptions = WRITING_DEFAULT_OPTIONS,
  ) {}

  /** The submit route's own fire-and-forget call, for a correction it just inserted as `running`. */
  async runClaimed(correctionId: string): Promise<void> {
    await this.run(correctionId);
  }

  /** The sweep's own entry point, for a correction whose lease it just reclaimed. */
  async claimAndRun(correctionId: string): Promise<void> {
    await this.run(correctionId);
  }

  private async run(correctionId: string): Promise<void> {
    try {
      const correction = await this.repository.correctionById(this.prisma, correctionId);
      if (!correction || correction.status !== 'running') {
        return;
      }
      const task = await this.repository.taskById(this.prisma, correction.taskId);
      if (!task) {
        return;
      }

      const variables = buildCorrectionPromptVariables({
        taskStatement: task.statement,
        targetTags: task.targetTags.map((tag) => ({ tag, label: this.taxonomy.labelOf(tag) })),
        submittedText: correction.submittedText,
        analysisTags: this.analysisTagEntries(),
      });

      const attemptOutcomes: string[] = [];
      let inputTokens = 0;
      let outputTokens = 0;
      let latencyMs = 0;

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const result = await this.promptExecution.execute(task.userId, WRITING_PROMPT_ID, variables);
          attemptOutcomes.push('ok');
          inputTokens += result.inputTokens ?? 0;
          outputTokens += result.outputTokens ?? 0;
          latencyMs += result.latencyMs;

          await this.settleSuccess(
            task,
            correctionId,
            result.data as RawWritingCorrectionResponse,
            { promptId: result.promptId, promptVersion: result.promptVersion, model: result.model },
            { attempts: attempt, attemptOutcomes, inputTokens, outputTokens, latencyMs },
          );
          return;
        } catch (error) {
          const classified = classifyCorrectionError(error);
          attemptOutcomes.push(classified.attemptOutcome);

          const isLastAttempt = attempt === 2;
          if (classified.kind === 'retryable' && !isLastAttempt) {
            await delay(this.options.autoRetryDelayMs);
            continue;
          }

          const failureCode: WritingFailureCode = classified.kind === 'retryable' ? 'request_failed' : classified.kind;
          const prompt = classified.kind === 'invalid_output' ? this.promptRegistry.get(WRITING_PROMPT_ID) : null;
          await this.settleFailure(task, correctionId, {
            attempts: attempt,
            attemptOutcomes,
            failureCode,
            failureDetail: classified.detail,
            rawResponse: classified.rawResponse ?? null,
            promptId: prompt?.id ?? null,
            promptVersion: prompt?.version ?? null,
            model: prompt?.model ?? null,
          });
          return;
        }
      }
    } catch (error) {
      this.logger.error(`Writing correction ${correctionId} crashed`, error);
    }
  }

  private analysisTagEntries(): TaxonomyTagEntry[] {
    const current = this.taxonomy.current();
    const analysisTagSet = new Set(current.analysisTags);
    return current.tags
      .filter((tag) => analysisTagSet.has(tag.tag))
      .map((tag) => ({ tag: tag.tag, label: tag.label, description: tag.description }));
  }

  private async settleSuccess(
    task: WritingTask,
    correctionId: string,
    raw: RawWritingCorrectionResponse,
    stamp: { promptId: string; promptVersion: string; model: string },
    telemetry: { attempts: number; attemptOutcomes: string[]; inputTokens: number; outputTokens: number; latencyMs: number },
  ): Promise<void> {
    const correction = await this.repository.correctionById(this.prisma, correctionId);
    if (!correction) {
      return;
    }
    const processed = processCorrectionOutput({ raw, submittedText: correction.submittedText });

    const uniqueTags = [...new Set(processed.errors.map((error) => error.tag))];
    const priorEntries = uniqueTags.length > 0 ? await this.ledger.entriesFor(task.userId, { tags: uniqueTags, includeRetired: true }) : [];
    const ledgerPriorCounts = Object.fromEntries(priorEntries.map((entry) => [entry.tag, entry.occurrenceCount]));

    await this.prisma.$transaction(async (tx) => {
      const locked = await this.repository.correctionForUpdate(tx, correctionId);
      if (!locked || locked.status !== 'running') {
        return;
      }

      await this.repository.insertErrors(
        tx,
        correctionId,
        processed.errors.map((error) => ({
          idx: error.idx,
          quote: error.quote,
          tag: error.tag,
          correction: error.correction,
          explanation: error.explanation,
          startOffset: error.startOffset,
          endOffset: error.endOffset,
        })),
      );

      const resolved = await this.plans.resolveForOwner(task.userId, task.activityId, tx);
      const ingestion = await this.profileIngestion.ingestActivityOutcome(
        toActivityOutcome({
          correctionId,
          userId: task.userId,
          resolvedActivityId: resolved.activityId,
          occurredAt: new Date(),
          scores: { grammar: raw.scores.grammar, vocabulary: raw.scores.vocabulary, coherence: raw.scores.coherence },
          errors: processed.errors,
        }),
        tx,
      );

      await this.repository.markSucceeded(tx, correctionId, {
        attempts: telemetry.attempts,
        attemptOutcomes: telemetry.attemptOutcomes,
        promptId: stamp.promptId,
        promptVersion: stamp.promptVersion,
        model: stamp.model,
        inputTokens: telemetry.inputTokens || null,
        outputTokens: telemetry.outputTokens || null,
        latencyMs: telemetry.latencyMs || null,
        overallComment: raw.overall_comment,
        scoreGrammar: raw.scores.grammar,
        scoreVocabulary: raw.scores.vocabulary,
        scoreCoherence: raw.scores.coherence,
        scoreTaskAchievement: raw.scores.task_achievement,
        revisedText: raw.revised_text,
        discardedErrorCount: processed.discardedErrorCount,
        ledgerPriorCounts,
        rejectedTags: ingestion.rejectedTags,
      });

      const now = new Date();
      if (resolved.planStatus === 'active') {
        await this.plans.markCompleted(
          task.userId,
          resolved.activityId,
          { completionKey: correctionId, completedAt: now, timeSpentSeconds: task.activeSeconds },
          tx,
        );
      }
      await this.repository.setCorrected(tx, task.id, now);
    });
  }

  private async settleFailure(
    task: WritingTask,
    correctionId: string,
    update: {
      attempts: number;
      attemptOutcomes: string[];
      failureCode: WritingFailureCode;
      failureDetail: string;
      rawResponse: string | null;
      promptId: string | null;
      promptVersion: string | null;
      model: string | null;
    },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const locked = await this.repository.correctionForUpdate(tx, correctionId);
      if (!locked || locked.status !== 'running') {
        return;
      }
      await this.repository.markFailed(tx, correctionId, update);

      const currentTask = await this.repository.taskById(tx, task.id);
      if (currentTask?.status === 'correcting') {
        await this.repository.setFailureStatus(tx, task.id, WRITING_FAILURE_STATUS[update.failureCode]);
      }
    });
  }
}
