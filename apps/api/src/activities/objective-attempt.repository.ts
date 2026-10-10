import { Injectable } from '@nestjs/common';
import type { ObjectiveAttempt, Prisma } from '@prisma/client';
import type { DifficultyRating } from '@english-quest/shared';

import { PrismaService } from '../prisma/prisma.service';
import type { GradedQuestion } from './objective/grading';

export type TxClient = Prisma.TransactionClient;

export interface NewObjectiveAttempt {
  userId: string;
  planActivityId: string;
  contentItemId: string;
  kind: string;
  provenance: string;
  promptId: string | null;
  promptVersion: string | null;
  questions: unknown;
  questionsFingerprint: string;
  startedAt: Date;
}

export interface SubmittedAttemptData {
  answers: unknown;
  results: GradedQuestion[];
  scoreCorrect: number;
  scoreTotal: number;
  unscoredCount: number;
  timeSpentSeconds: number;
  submittedAt: Date;
}

/**
 * The one reader and writer of `objective_attempts`. A "lineage" is the
 * activity's carry-over chain (F15): an attempt created against an old row
 * still belongs to the newest copy of the same activity.
 */
@Injectable()
export class ObjectiveAttemptRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insert(tx: TxClient, row: NewObjectiveAttempt): Promise<ObjectiveAttempt> {
    return tx.objectiveAttempt.create({
      data: { ...row, questions: row.questions as Prisma.InputJsonValue },
    });
  }

  /** The submitted attempt in the lineage, otherwise the open one, otherwise null. An abandoned one is never returned. */
  async currentInLineage(client: TxClient | PrismaService, lineage: readonly string[]): Promise<ObjectiveAttempt | null> {
    const submitted = await client.objectiveAttempt.findFirst({
      where: { planActivityId: { in: [...lineage] }, status: 'submitted' },
    });
    if (submitted) {
      return submitted;
    }
    return client.objectiveAttempt.findFirst({
      where: { planActivityId: { in: [...lineage] }, status: 'open' },
      orderBy: { startedAt: 'desc' },
    });
  }

  /** `SELECT … FOR UPDATE` on the attempt row; null when it is not this caller's within the lineage. */
  async lockForSubmission(
    tx: TxClient,
    attemptId: string,
    userId: string,
    lineage: readonly string[],
  ): Promise<ObjectiveAttempt | null> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM objective_attempts WHERE id = ${attemptId}::uuid AND user_id = ${userId}::uuid FOR UPDATE
    `;
    if (rows.length === 0) {
      return null;
    }
    const attempt = await tx.objectiveAttempt.findUnique({ where: { id: attemptId } });
    return attempt && lineage.includes(attempt.planActivityId) ? attempt : null;
  }

  async markSubmitted(tx: TxClient, attemptId: string, data: SubmittedAttemptData): Promise<void> {
    await tx.objectiveAttempt.update({
      where: { id: attemptId },
      data: {
        status: 'submitted',
        answers: data.answers as Prisma.InputJsonValue,
        results: data.results as unknown as Prisma.InputJsonValue,
        scoreCorrect: data.scoreCorrect,
        scoreTotal: data.scoreTotal,
        unscoredCount: data.unscoredCount,
        timeSpentSeconds: data.timeSpentSeconds,
        submittedAt: data.submittedAt,
      },
    });
  }

  /** Closes any open attempt in the lineage; a submitted one is left alone. */
  async abandonOpen(tx: TxClient, lineage: readonly string[], at: Date): Promise<void> {
    await tx.objectiveAttempt.updateMany({
      where: { planActivityId: { in: [...lineage] }, status: 'open' },
      data: { status: 'abandoned', abandonedAt: at },
    });
  }

  /** Ratings exist only on graded attempts (`ck_objective_attempts_rating`). */
  async setRating(
    tx: TxClient,
    lineage: readonly string[],
    rating: DifficultyRating | null,
    notUseful: boolean,
    at: Date,
  ): Promise<void> {
    await tx.objectiveAttempt.updateMany({
      where: { planActivityId: { in: [...lineage] }, status: 'submitted' },
      data: { difficultyRating: rating, notUseful, ratedAt: at },
    });
  }
}
