import { Injectable } from '@nestjs/common';
import { Prisma, type SpeakingAttempt } from '@prisma/client';
import type { PronunciationScores, SpeakingFailureCode } from '@english-quest/shared';

import { PrismaService } from '../prisma/prisma.service';
import type { AttemptSummary } from './scoring/attempt-policy';
import { SCORING_LEASE_MS } from './speaking.constants';

export type TxClient = Prisma.TransactionClient;

/** A Prisma row as the pure policy functions in `scoring/attempt-policy.ts` see it. */
export function toAttemptSummary(attempt: SpeakingAttempt): AttemptSummary {
  return {
    id: attempt.id,
    state: attempt.state as AttemptSummary['state'],
    ordinal: attempt.ordinal,
    scoringStartedAt: attempt.scoringStartedAt,
    failureCode: attempt.failureCode as SpeakingFailureCode | null,
    pronunciation: attempt.pronunciation,
  };
}

export interface NewScoringAttemptRow {
  id: string;
  taskId: string;
  userId: string;
  activityId: string;
  clientAttemptId: string;
  audioObjectKey: string;
  audioBytes: number;
  durationMs: number;
  scoringStartedAt: Date;
}

export interface NewDiscardedAttemptRow {
  id: string;
  taskId: string;
  userId: string;
  activityId: string;
  clientAttemptId: string;
  audioBytes: number;
  durationMs: number;
  failureReason: string;
}

export type SettleInput =
  | {
      state: 'scored';
      ordinal: number;
      scoredAt: Date;
      scores: PronunciationScores;
      recognizedWordCount: number;
      transcriptText: string | null;
      words: unknown;
      failingPhonemes: unknown;
      segments: unknown;
      locale: string;
      latencyMs: number;
    }
  | { state: 'failed'; failureCode: SpeakingFailureCode; failureReason: string }
  | { state: 'discarded'; failureCode: 'not_enough_speech'; failureReason: string };

/**
 * Persistence for `speaking_attempts`. Every attempt is retained; only the
 * caller (`speaking-attempt.service.ts`) decides state transitions and holds
 * the task-row lock they must run under.
 */
@Injectable()
export class SpeakingAttemptRepository {
  constructor(private readonly prisma: PrismaService) {}

  byClientId(client: TxClient | PrismaService, userId: string, clientAttemptId: string): Promise<SpeakingAttempt | null> {
    return client.speakingAttempt.findUnique({ where: { userId_clientAttemptId: { userId, clientAttemptId } } });
  }

  /** Oldest first, as the activity view lists them. */
  forTask(client: TxClient | PrismaService, taskId: string): Promise<SpeakingAttempt[]> {
    return client.speakingAttempt.findMany({ where: { taskId }, orderBy: { createdAt: 'asc' } });
  }

  /** Another user's attempt id and an unknown one are the same answer, so existence never leaks. */
  byIdForOwner(client: TxClient | PrismaService, userId: string, attemptId: string): Promise<SpeakingAttempt | null> {
    return client.speakingAttempt.findFirst({ where: { id: attemptId, userId } });
  }

  insertScoring(tx: TxClient, row: NewScoringAttemptRow): Promise<SpeakingAttempt> {
    return tx.speakingAttempt.create({
      data: {
        id: row.id,
        taskId: row.taskId,
        userId: row.userId,
        activityId: row.activityId,
        clientAttemptId: row.clientAttemptId,
        state: 'scoring',
        audioObjectKey: row.audioObjectKey,
        audioBytes: row.audioBytes,
        durationMs: row.durationMs,
        scoringStartedAt: row.scoringStartedAt,
      },
    });
  }

  /** A clip under the 2 s floor (A30): stored `discarded` from the start, with no object ever written. */
  insertDiscarded(tx: TxClient, row: NewDiscardedAttemptRow): Promise<SpeakingAttempt> {
    return tx.speakingAttempt.create({
      data: {
        id: row.id,
        taskId: row.taskId,
        userId: row.userId,
        activityId: row.activityId,
        clientAttemptId: row.clientAttemptId,
        state: 'discarded',
        audioObjectKey: null,
        audioBytes: row.audioBytes,
        durationMs: row.durationMs,
        failureCode: 'not_enough_speech',
        failureReason: row.failureReason,
      },
    });
  }

  /** Re-opens a `failed` (or lease-expired `scoring`) attempt for another scoring pass, clearing its earlier failure. */
  markScoringAgain(tx: TxClient, attemptId: string, now: Date): Promise<SpeakingAttempt> {
    return tx.speakingAttempt.update({
      where: { id: attemptId },
      data: {
        state: 'scoring',
        scoringStartedAt: now,
        failureCode: null,
        failureReason: null,
        rescoreCount: { increment: 1 },
      },
    });
  }

  /** A `scoring` row past its lease, read as a crash mid-request (A13). At most one per task by construction. */
  async markInterrupted(tx: TxClient, taskId: string, now: Date, message: string): Promise<void> {
    const staleBefore = new Date(now.getTime() - SCORING_LEASE_MS);
    await tx.speakingAttempt.updateMany({
      where: { taskId, state: 'scoring', scoringStartedAt: { lt: staleBefore } },
      data: { state: 'failed', failureCode: 'interrupted', failureReason: message },
    });
  }

  async settle(tx: TxClient, attemptId: string, input: SettleInput): Promise<SpeakingAttempt> {
    if (input.state === 'scored') {
      return tx.speakingAttempt.update({
        where: { id: attemptId },
        data: {
          state: 'scored',
          ordinal: input.ordinal,
          scoredAt: input.scoredAt,
          pronunciation: input.scores.pronunciation,
          accuracy: input.scores.accuracy,
          fluency: input.scores.fluency,
          prosody: input.scores.prosody,
          completeness: input.scores.completeness,
          recognizedWordCount: input.recognizedWordCount,
          transcriptText: input.transcriptText,
          words: input.words as Prisma.InputJsonValue,
          failingPhonemes: input.failingPhonemes as Prisma.InputJsonValue,
          segments: input.segments as Prisma.InputJsonValue,
          locale: input.locale,
          latencyMs: input.latencyMs,
          failureCode: null,
          failureReason: null,
        },
      });
    }
    if (input.state === 'discarded') {
      return tx.speakingAttempt.update({
        where: { id: attemptId },
        data: { state: 'discarded', audioObjectKey: null, failureCode: input.failureCode, failureReason: input.failureReason },
      });
    }
    return tx.speakingAttempt.update({
      where: { id: attemptId },
      data: { state: 'failed', failureCode: input.failureCode, failureReason: input.failureReason },
    });
  }

  async delete(client: TxClient | PrismaService, attemptId: string): Promise<void> {
    await client.speakingAttempt.delete({ where: { id: attemptId } });
  }
}
