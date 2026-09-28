import { Injectable } from '@nestjs/common';
import type { StudyPlanRequest, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { PLAN_REQUEST_LEASE_MS } from '../plans/plan.constants';

type TxClient = Prisma.TransactionClient;

/**
 * The fallback (F07) and interim-plan (Gemini-blocked analysis) request
 * queue: `PlanRequestJob` discovers, claims and settles rows here. Kept
 * free of Prisma relations across tables that have none (branches and
 * requests share only `userId`/`lessonId`) by doing "not already
 * requested" as a second existence check rather than raw SQL.
 */
@Injectable()
export class PlanRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insertIfAbsent(userId: string, lessonId: string, origin: 'recording_failed' | 'analysis_blocked'): Promise<void> {
    await this.prisma.studyPlanRequest.upsert({
      where: { userId_lessonId_origin: { userId, lessonId, origin } },
      create: { userId, lessonId, origin },
      update: {},
    });
  }

  /** The one request row for this (user, lesson, origin), for the owner's retry to look up its id. */
  async pendingRequestFor(
    client: TxClient | PrismaService,
    userId: string,
    lessonId: string,
    origin: string,
  ): Promise<StudyPlanRequest | null> {
    return client.studyPlanRequest.findUnique({ where: { userId_lessonId_origin: { userId, lessonId, origin } } });
  }

  private async withoutExisting(
    origin: 'recording_failed' | 'analysis_blocked',
    pairs: Array<{ userId: string; lessonId: string }>,
  ): Promise<Array<{ userId: string; lessonId: string }>> {
    if (pairs.length === 0) {
      return [];
    }
    const existing = await this.prisma.studyPlanRequest.findMany({
      where: { origin, OR: pairs.map((pair) => ({ userId: pair.userId, lessonId: pair.lessonId })) },
      select: { userId: true, lessonId: true },
    });
    const existingKeys = new Set(existing.map((row) => `${row.userId}:${row.lessonId}`));
    return pairs.filter((pair) => !existingKeys.has(`${pair.userId}:${pair.lessonId}`));
  }

  /** Branches F07 flagged for a fallback plan (`fallback_requested_at` set) with no request row yet — drains any recorded before F15 shipped. */
  async discoverFallbacks(limit: number): Promise<Array<{ userId: string; lessonId: string }>> {
    const branches = await this.prisma.lessonPipelineBranch.findMany({
      where: { fallbackRequestedAt: { not: null } },
      select: { userId: true, lessonId: true },
      orderBy: { fallbackRequestedAt: 'asc' },
      take: limit,
    });
    return this.withoutExisting('recording_failed', branches);
  }

  /** Branches whose `lesson_analysis` stage is blocked on a missing or rejected Gemini key, with no interim request yet. */
  async discoverBlockedAnalyses(limit: number): Promise<Array<{ userId: string; lessonId: string }>> {
    const stages = await this.prisma.lessonPipelineStage.findMany({
      where: { stage: 'lesson_analysis', status: 'blocked_missing_key', blockedProvider: 'gemini' },
      select: { branch: { select: { userId: true, lessonId: true } } },
      orderBy: { queuedAt: 'asc' },
      take: limit,
    });
    return this.withoutExisting(
      'analysis_blocked',
      stages.map((stage) => stage.branch),
    );
  }

  /**
   * Claims the oldest eligible request not already claimed for a user in
   * `excludeUserIds` this tick — pending, due for retry, or running past
   * its lease. An optimistic conditional update loses the race silently
   * (returns null) if another process claimed it first.
   */
  async claimOne(now: Date, excludeUserIds: ReadonlySet<string>): Promise<StudyPlanRequest | null> {
    const leaseExpiry = new Date(now.getTime() - PLAN_REQUEST_LEASE_MS);
    const candidate = await this.prisma.studyPlanRequest.findFirst({
      where: {
        userId: { notIn: [...excludeUserIds] },
        OR: [{ status: 'pending' }, { status: 'retrying', nextAttemptAt: { lte: now } }, { status: 'running', claimedAt: { lte: leaseExpiry } }],
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!candidate) {
      return null;
    }
    const claimed = await this.prisma.studyPlanRequest.updateMany({
      where: { id: candidate.id, status: candidate.status, attempts: candidate.attempts },
      data: { status: 'running', claimedAt: now, attempts: { increment: 1 } },
    });
    if (claimed.count === 0) {
      return null;
    }
    return { ...candidate, status: 'running', claimedAt: now, attempts: candidate.attempts + 1 };
  }

  async setProgress(id: string, done: number, total: number): Promise<void> {
    await this.prisma.studyPlanRequest.update({ where: { id }, data: { progressDone: done, progressTotal: total } });
  }

  async complete(tx: TxClient, id: string, planId: string, now: Date): Promise<void> {
    await tx.studyPlanRequest.update({ where: { id }, data: { status: 'completed', planId, finishedAt: now } });
  }

  async supersede(id: string, now: Date): Promise<void> {
    await this.prisma.studyPlanRequest.update({ where: { id }, data: { status: 'superseded', finishedAt: now } });
  }

  async scheduleRetry(id: string, nextAttemptAt: Date): Promise<void> {
    await this.prisma.studyPlanRequest.update({
      where: { id },
      data: { status: 'retrying', nextAttemptAt, progressDone: null, progressTotal: null },
    });
  }

  async fail(id: string, reason: string, now: Date): Promise<void> {
    await this.prisma.studyPlanRequest.update({ where: { id }, data: { status: 'failed', failureReason: reason, finishedAt: now } });
  }

  /** The owner's retry: a failed request only, reset to run again from attempt zero. */
  async resetForRetry(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.studyPlanRequest.updateMany({
      where: { id, userId, status: 'failed' },
      data: {
        status: 'pending',
        attempts: 0,
        failureReason: null,
        nextAttemptAt: null,
        claimedAt: null,
        progressDone: null,
        progressTotal: null,
        finishedAt: null,
      },
    });
    return result.count > 0;
  }
}
