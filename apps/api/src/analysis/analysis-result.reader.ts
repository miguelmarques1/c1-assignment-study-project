import { Injectable } from '@nestjs/common';
import type { AnalysisCompetency, ErrorSeverity, Register, ScenarioContext } from '@english-quest/shared';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import { PrismaService } from '../prisma/prisma.service';

const justificationsSchema = z.object({
  grammar: z.string(),
  vocabulary: z.string(),
  fluency: z.string(),
  interaction: z.string(),
  comprehension: z.string(),
});

const stringArraySchema = z.array(z.string());

const scenarioFitSchema = z.object({
  roleLabel: z.string(),
  registerExpected: z.enum(['formal', 'neutral', 'informal']),
  registerMatched: z.boolean(),
  registerComment: z.string(),
  expressionsUsed: z.array(z.string()),
  expressionsNotUsed: z.array(z.string()),
});

export interface StoredAnalysisCompetencyScore {
  score: number;
  justification: string;
}

export interface StoredAnalysisError {
  /** The error row — what F12's ledger occurrence points back to. */
  id: string;
  idx: number;
  quote: string;
  tag: string;
  correction: string;
  explanation: string;
  severity: ErrorSeverity;
  utteranceId: string | null;
}

export interface StoredScenarioFit {
  roleLabel: string;
  registerExpected: Register;
  registerMatched: boolean;
  registerComment: string;
  expressionsUsed: string[];
  expressionsNotUsed: string[];
}

export interface StoredAnalysis {
  id: string;
  competencies: Record<AnalysisCompetency, StoredAnalysisCompetencyScore>;
  strengths: string[];
  errors: StoredAnalysisError[];
  recurringTags: string[];
  scenarioContext: ScenarioContext;
  scenarioFit: StoredScenarioFit | null;
  pronunciationContext: 'assessed' | 'no_sample';
  transcriptTokensEstimated: number;
  transcriptTruncated: boolean;
  taxonomyVersion: string;
  topics: string[];
  promptId: string;
  promptVersion: string;
  model: string;
  createdAt: Date;
}

type AnalysisWithErrors = Prisma.LessonAnalysisGetPayload<{ include: { errors: true } }>;

/**
 * The read side of F11: one owner's own analysis (and, for the route's
 * deltas, their own most recent earlier one), for F12's ingestion and F19's
 * routes. Always one owner at a time — never another participant's.
 */
@Injectable()
export class LessonAnalysisReader {
  constructor(private readonly prisma: PrismaService) {}

  async forParticipant(lessonId: string, userId: string): Promise<StoredAnalysis | null> {
    const analysis = await this.prisma.lessonAnalysis.findUnique({
      where: { lessonId_userId: { lessonId, userId } },
      include: { errors: { orderBy: { idx: 'asc' } } },
    });
    return analysis ? this.toStored(analysis) : null;
  }

  /** The owner's most recent analysed lesson that started strictly before `beforeLessonStartedAt` — what the route's competency deltas compare against. Null on the owner's first analysed lesson, or when the current lesson never started. */
  async previousFor(userId: string, beforeLessonStartedAt: Date | null): Promise<StoredAnalysis | null> {
    if (!beforeLessonStartedAt) {
      return null;
    }
    const analysis = await this.prisma.lessonAnalysis.findFirst({
      where: { userId, lesson: { startedAt: { lt: beforeLessonStartedAt } } },
      orderBy: { lesson: { startedAt: 'desc' } },
      include: { errors: { orderBy: { idx: 'asc' } } },
    });
    return analysis ? this.toStored(analysis) : null;
  }

  private toStored(analysis: AnalysisWithErrors): StoredAnalysis {
    const justifications = justificationsSchema.parse(analysis.justifications);
    return {
      id: analysis.id,
      competencies: {
        grammar: { score: analysis.grammar, justification: justifications.grammar },
        vocabulary: { score: analysis.vocabulary, justification: justifications.vocabulary },
        fluency: { score: analysis.fluency, justification: justifications.fluency },
        interaction: { score: analysis.interaction, justification: justifications.interaction },
        comprehension: { score: analysis.comprehension, justification: justifications.comprehension },
      },
      strengths: stringArraySchema.parse(analysis.strengths),
      errors: analysis.errors.map((error) => ({
        id: error.id,
        idx: error.idx,
        quote: error.quote,
        tag: error.tag,
        correction: error.correction,
        explanation: error.explanation,
        severity: error.severity as ErrorSeverity,
        utteranceId: error.utteranceId,
      })),
      recurringTags: stringArraySchema.parse(analysis.recurringTags),
      scenarioContext: analysis.scenarioContext as ScenarioContext,
      scenarioFit: analysis.scenarioFit ? scenarioFitSchema.parse(analysis.scenarioFit) : null,
      pronunciationContext: analysis.pronunciationContext as 'assessed' | 'no_sample',
      transcriptTokensEstimated: analysis.transcriptTokensEstimated,
      transcriptTruncated: analysis.transcriptTruncated,
      taxonomyVersion: analysis.taxonomyVersion,
      topics: stringArraySchema.parse(analysis.topics),
      promptId: analysis.promptId,
      promptVersion: analysis.promptVersion,
      model: analysis.model,
      createdAt: analysis.createdAt,
    };
  }
}
