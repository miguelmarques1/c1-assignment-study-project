import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import type { StageRunContext } from '../pipeline/pipeline-stage.handler';
import { PrismaService } from '../prisma/prisma.service';
import type { MappedWord } from '../speech/pronunciation-assessment.response';

/** The shape `words` round-trips through `jsonb` as — this stage's own write, read back for aggregation and the reader. */
export const storedWordSchema = z.object({
  word: z.string(),
  accuracy: z.number(),
  errorTypes: z.array(z.string()),
  offsetMs: z.number(),
  durationMs: z.number(),
  phonemes: z.array(
    z.object({ phoneme: z.string(), accuracy: z.number(), offsetMs: z.number(), durationMs: z.number() }),
  ),
});
export const storedWordsSchema = z.array(storedWordSchema);
export type StoredWord = z.infer<typeof storedWordSchema>;

export type ExcerptFailureStatus = 'failed' | 'dropped' | 'abandoned';
export type ExcerptFailureCode = 'service_error' | 'audio_rejected' | 'no_speech_recognized' | 'slice_failed' | 'quota_exhausted';

export interface AssessedWrite {
  clipStartMs: number;
  clipEndMs: number;
  scores: { pronunciation: number; accuracy: number; fluency: number; prosody: number | null; completeness: number };
  words: MappedWord[];
  recognizedText: string;
  latencyMs: number;
  /** Requests actually sent for this excerpt in this settle — 1 plus any inline retries. */
  attemptsUsed: number;
}

export type AssessmentCounts = Partial<Record<'pending' | 'assessed' | 'failed' | 'dropped' | 'abandoned', number>>;

/**
 * Per-excerpt state for the pronunciation stage. Every write runs under
 * `context.withinRun`, so it commits only while this run still owns the
 * stage — the mechanism that lets a retry reprocess just the excerpts that
 * are not `assessed`, and a blocked-then-resumed run keep what already
 * landed, without the completing transaction ever seeing a stalled write.
 */
@Injectable()
export class ExcerptAssessmentStore {
  constructor(private readonly prisma: PrismaService) {}

  /** One row per excerpt, created `pending`; an existing row (from an earlier run) is left untouched. */
  async ensureRows(context: StageRunContext, lessonId: string, userId: string, excerptIds: string[]): Promise<void> {
    await context.withinRun((tx) =>
      tx.lessonExcerptAssessment.createMany({
        data: excerptIds.map((excerptId) => ({ excerptId, lessonId, userId })),
        skipDuplicates: true,
      }),
    );
  }

  /** Sends every row that is not `assessed` back to `pending` with its failure cleared — what a fresh run reprocesses. */
  async resetUnassessed(context: StageRunContext, excerptIds: string[]): Promise<void> {
    await context.withinRun((tx) =>
      tx.lessonExcerptAssessment.updateMany({
        where: { excerptId: { in: excerptIds }, status: { not: 'assessed' } },
        data: { status: 'pending', failureCode: null, failureMessage: null },
      }),
    );
  }

  async recordAssessed(context: StageRunContext, excerptId: string, write: AssessedWrite): Promise<void> {
    await context.withinRun((tx) =>
      tx.lessonExcerptAssessment.update({
        where: { excerptId },
        data: {
          status: 'assessed',
          attempts: { increment: write.attemptsUsed },
          failureCode: null,
          failureMessage: null,
          clipStartMs: write.clipStartMs,
          clipEndMs: write.clipEndMs,
          pronunciation: write.scores.pronunciation,
          accuracy: write.scores.accuracy,
          fluency: write.scores.fluency,
          prosody: write.scores.prosody,
          completeness: write.scores.completeness,
          words: write.words as unknown as Prisma.InputJsonValue,
          recognizedText: write.recognizedText,
          latencyMs: write.latencyMs,
          assessedAt: new Date(),
        },
      }),
    );
  }

  async recordFailed(
    context: StageRunContext,
    excerptId: string,
    status: ExcerptFailureStatus,
    failureCode: ExcerptFailureCode,
    failureMessage: string | null,
    attemptsUsed = 0,
  ): Promise<void> {
    await context.withinRun((tx) =>
      tx.lessonExcerptAssessment.update({
        where: { excerptId },
        data: {
          status,
          failureCode,
          failureMessage: failureMessage?.slice(0, 500) ?? null,
          ...(attemptsUsed > 0 ? { attempts: { increment: attemptsUsed } } : {}),
        },
      }),
    );
  }

  /** Counts by status, for the settle decision and the progress counter. Not guarded: read-only. */
  async counts(lessonId: string, userId: string): Promise<AssessmentCounts> {
    const rows = await this.prisma.lessonExcerptAssessment.groupBy({
      by: ['status'],
      where: { lessonId, userId },
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((row) => [row.status, row._count._all])) as AssessmentCounts;
  }
}
