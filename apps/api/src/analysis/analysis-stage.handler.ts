import { ERROR_CODES, type CredentialStatus } from '@english-quest/shared';
import { Injectable, type OnModuleInit } from '@nestjs/common';

import { AppError } from '../common/app-error';
import { CredentialsService } from '../credentials/credentials.service';
import type { PipelineStageHandler, StageRunContext } from '../pipeline/pipeline-stage.handler';
import { PipelineStageRegistry } from '../pipeline/pipeline-stage.registry';
import { PromptExecutionService } from '../prompts/prompt-execution.service';
import { AnalysisInputBuilder } from './analysis-input.builder';
import { classifyAnalysisError } from './analysis-outcome';
import { processAnalysisOutput, type RawAnalysisOutput } from './analysis-output';
import { AnalysisResultWriter } from './analysis-result.writer';
import { ANALYSIS_MAX_ERRORS, ANALYSIS_RETRY_POLICY } from './analysis.constants';

/**
 * The `lesson_analysis` stage: one participant's own analysis, produced
 * with their own Gemini key through F04's `PromptExecutionService`. Every
 * branch F10 settled is already waiting here. One execution, no progress
 * counter — a single call per participant per lesson (the PRD's objective).
 */
@Injectable()
export class AnalysisStageHandler implements PipelineStageHandler, OnModuleInit {
  readonly stage = 'lesson_analysis' as const;
  readonly provider = 'gemini' as const;
  readonly retryPolicy = ANALYSIS_RETRY_POLICY;

  constructor(
    private readonly registry: PipelineStageRegistry,
    private readonly inputBuilder: AnalysisInputBuilder,
    private readonly promptExecution: PromptExecutionService,
    private readonly writer: AnalysisResultWriter,
    private readonly credentials: CredentialsService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async run(context: StageRunContext): Promise<void> {
    const input = await this.inputBuilder.build(context.lessonId, context.userId);

    let executed;
    try {
      executed = await this.promptExecution.execute(
        context.userId,
        'lesson-analysis',
        input.variables as unknown as Record<string, string>,
      );
    } catch (error) {
      throw await this.classify(context.userId, error);
    }

    const raw = executed.data as RawAnalysisOutput;
    const processed = processAnalysisOutput({
      raw,
      ownUtterances: input.ownUtterances,
      scenarioContext: input.scenarioContext,
      roleLabel: input.roleLabel,
      registerExpected: input.registerExpected,
      cardTargetExpressions: input.cardTargetExpressions,
      profileTags: input.profileTags,
      lessonDurationSeconds: input.lessonDurationSeconds,
      maxErrors: ANALYSIS_MAX_ERRORS,
    });

    await context.complete((tx) =>
      this.writer.replace(tx, {
        lessonId: context.lessonId,
        userId: context.userId,
        competencies: raw.competencies,
        strengths: raw.strengths,
        recurringTags: processed.recurringTags,
        topics: raw.topics_to_practice,
        scenarioContext: input.scenarioContext,
        scenarioFit: processed.scenarioFit,
        pronunciationContext: input.pronunciationContext,
        transcriptTokensEstimated: input.transcriptTokensEstimated,
        transcriptTruncated: input.transcriptTruncated,
        truncation: input.truncation,
        profileTagCount: input.profileTags.length,
        discardedErrorCount: processed.discardedErrorCount,
        curatorFlags: processed.curatorFlags,
        taxonomyVersion: input.taxonomyVersion,
        promptId: executed.promptId,
        promptVersion: executed.promptVersion,
        model: executed.model,
        inputTokens: executed.inputTokens,
        outputTokens: executed.outputTokens,
        latencyMs: executed.latencyMs,
        schemaRetried: executed.retried,
        errors: processed.errors,
      }),
    );
  }

  /**
   * The vault reads the same for "no key" and "a key already marked
   * invalid" (`CRED002` either way), so the two sentences need one more
   * lookup to tell apart — done only for that one outcome, matching F08's
   * own reasoning for the identical ambiguity.
   */
  private async classify(userId: string, error: unknown): Promise<unknown> {
    let geminiStatus: CredentialStatus | 'missing' | undefined;
    if (error instanceof AppError && error.code === ERROR_CODES.CREDENTIAL_UNAVAILABLE) {
      const gemini = (await this.credentials.list(userId)).find((entry) => entry.provider === 'gemini');
      geminiStatus = gemini?.status;
    }
    return classifyAnalysisError(error, geminiStatus) ?? error;
  }
}
