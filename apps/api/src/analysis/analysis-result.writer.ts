import { Injectable } from '@nestjs/common';
import type { AnalysisCompetency, ScenarioContext } from '@english-quest/shared';
import { Prisma } from '@prisma/client';

import type { AnalysisTruncation } from './analysis-input.builder';
import type { CuratorFlag, ProcessedAnalysisError, ProcessedScenarioFit } from './analysis-output';

export interface AnalysisCompetencyScore {
  score: number;
  justification: string;
}

export interface AnalysisWriteInput {
  lessonId: string;
  userId: string;
  competencies: Record<AnalysisCompetency, AnalysisCompetencyScore>;
  strengths: string[];
  recurringTags: string[];
  topics: string[];
  scenarioContext: ScenarioContext;
  scenarioFit: ProcessedScenarioFit | null;
  pronunciationContext: 'assessed' | 'no_sample';
  transcriptTokensEstimated: number;
  transcriptTruncated: boolean;
  truncation: AnalysisTruncation | null;
  profileTagCount: number;
  discardedErrorCount: number;
  curatorFlags: CuratorFlag[];
  taxonomyVersion: string;
  promptId: string;
  promptVersion: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  schemaRetried: boolean;
  errors: ProcessedAnalysisError[];
}

/**
 * Owns every write to `lesson_analyses` and `lesson_analysis_errors`. Called
 * only from inside the stage's completing transaction (`context.complete`),
 * so a partial write never persists and a stalled duplicate commits nothing.
 */
@Injectable()
export class AnalysisResultWriter {
  /** Replaces the owner's previous analysis for this lesson (its errors cascade with it) and inserts the new one. */
  async replace(tx: Prisma.TransactionClient, input: AnalysisWriteInput): Promise<void> {
    await tx.lessonAnalysis.deleteMany({ where: { lessonId: input.lessonId, userId: input.userId } });

    await tx.lessonAnalysis.create({
      data: {
        lessonId: input.lessonId,
        userId: input.userId,
        grammar: input.competencies.grammar.score,
        vocabulary: input.competencies.vocabulary.score,
        fluency: input.competencies.fluency.score,
        interaction: input.competencies.interaction.score,
        comprehension: input.competencies.comprehension.score,
        justifications: {
          grammar: input.competencies.grammar.justification,
          vocabulary: input.competencies.vocabulary.justification,
          fluency: input.competencies.fluency.justification,
          interaction: input.competencies.interaction.justification,
          comprehension: input.competencies.comprehension.justification,
        },
        strengths: input.strengths,
        recurringTags: input.recurringTags,
        topics: input.topics,
        scenarioContext: input.scenarioContext,
        // A real (SQL) NULL, not the JSON `null` scalar `Prisma.JsonNull` would
        // store — `ck_lesson_analyses_fit`/`_truncation` both test `IS NULL`,
        // which is false for a column holding the JSON value `null`.
        scenarioFit: input.scenarioFit ? (input.scenarioFit as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        pronunciationContext: input.pronunciationContext,
        transcriptTokensEstimated: input.transcriptTokensEstimated,
        transcriptTruncated: input.transcriptTruncated,
        truncation: input.truncation ? (input.truncation as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        profileTagCount: input.profileTagCount,
        discardedErrorCount: input.discardedErrorCount,
        curatorFlags: input.curatorFlags,
        taxonomyVersion: input.taxonomyVersion,
        promptId: input.promptId,
        promptVersion: input.promptVersion,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        latencyMs: input.latencyMs,
        schemaRetried: input.schemaRetried,
        errors: {
          create: input.errors.map((error) => ({
            lessonId: input.lessonId,
            userId: input.userId,
            idx: error.idx,
            quote: error.quote,
            tag: error.tag,
            correction: error.correction,
            explanation: error.explanation,
            severity: error.severity,
            utteranceId: error.utteranceId,
          })),
        },
      },
    });
  }
}
