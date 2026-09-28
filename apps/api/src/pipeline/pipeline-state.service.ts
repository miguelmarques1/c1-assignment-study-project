import { Injectable } from '@nestjs/common';
import type { CredentialProvider } from '@english-quest/shared';
import { Prisma, type LessonPipelineBranch, type LessonPipelineStage } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { nextStageAfter, type QueuedPipelineStage } from './pipeline.constants';

/** The run that tried to commit no longer owns the stage — a stalled duplicate, or a stage retried meanwhile. */
export class StaleRunError extends Error {
  override readonly name = 'StaleRunError';
  constructor() {
    super('This stage run no longer owns the stage.');
  }
}

export type StageWithBranch = LessonPipelineStage & { branch: LessonPipelineBranch };

interface Reason {
  reasonCode: string;
  reason: string;
  providerMessage: string | null;
}

const CLEARED = {
  reasonCode: null,
  reason: null,
  providerMessage: null,
  blockedProvider: null,
  nextAttemptAt: null,
  finishedAt: null,
} as const;

/**
 * Copies exactly the three reason fields. Callers hand over the typed
 * outcome errors themselves, and spreading an Error instance would also
 * carry its `name` field into the Prisma update, which rejects it.
 */
function reasonFields(reason: Reason): Reason {
  return { reasonCode: reason.reasonCode, reason: reason.reason, providerMessage: reason.providerMessage };
}

/** Long enough for a lesson's worth of utterances to go in with room to spare. */
const COMPLETE_TRANSACTION_TIMEOUT_MS = 30_000;

/**
 * Owns every write to `lesson_pipeline_stages` and keeps the branch's
 * `stage`/`status` pointer in step with it, always in the same transaction —
 * the pointer is what F07's recording view and every "where is it now"
 * reader trust, so it may never disagree with the row it points at.
 */
@Injectable()
export class PipelineStateService {
  constructor(private readonly prisma: PrismaService) {}

  findStage(branchId: string, stage: QueuedPipelineStage): Promise<StageWithBranch | null> {
    return this.prisma.lessonPipelineStage.findUnique({
      where: { branchId_stage: { branchId, stage } },
      include: { branch: true },
    });
  }

  /**
   * The stage row for a branch entering `stage`, created at run 1 when it
   * does not exist yet and returned untouched when it does. The launch and
   * the drain's backfill can reach the same fresh branch at the same moment;
   * neither may bump the other's run.
   */
  async ensureStage(branchId: string, stage: QueuedPipelineStage, now: Date): Promise<LessonPipelineStage> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.lessonPipelineStage.createMany({
        data: [{ branchId, stage, status: 'queued', queuedAt: now }],
        skipDuplicates: true,
      });
      if (created.count > 0) {
        await this.movePointer(tx, branchId, stage, 'queued');
      }
      return tx.lessonPipelineStage.findUniqueOrThrow({ where: { branchId_stage: { branchId, stage } } });
    });
  }

  /**
   * Queues `stage` for the branch: a new row at run 1, or an existing one
   * reset to `queued` with the next run — how a re-run upstream stage
   * re-runs everything after it. Moves the pointer there.
   */
  async queueStage(
    branchId: string,
    stage: QueuedPipelineStage,
    now: Date,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<LessonPipelineStage> {
    const row = await client.lessonPipelineStage.upsert({
      where: { branchId_stage: { branchId, stage } },
      create: { branchId, stage, status: 'queued', queuedAt: now },
      update: {
        ...CLEARED,
        status: 'queued',
        run: { increment: 1 },
        queuedAt: now,
        startedAt: null,
        progressDone: null,
        progressTotal: null,
      },
    });
    await this.movePointer(client, branchId, stage, 'queued');
    return row;
  }

  /** Claims the stage for an attempt. Null when this run no longer owns it. */
  async markRunning(row: LessonPipelineStage, now: Date): Promise<LessonPipelineStage | null> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.lessonPipelineStage.updateMany({
        where: { id: row.id, run: row.run, status: { in: ['queued', 'running', 'retrying'] } },
        data: {
          ...CLEARED,
          status: 'running',
          attempts: { increment: 1 },
          lastAttemptAt: now,
          ...(row.startedAt ? {} : { startedAt: now }),
        },
      });
      if (claimed.count === 0) {
        return null;
      }
      await this.movePointer(tx, row.branchId, row.stage, 'running');
      return tx.lessonPipelineStage.findUniqueOrThrow({ where: { id: row.id } });
    });
  }

  async markRetrying(row: LessonPipelineStage, reason: Reason, nextAttemptAt: Date): Promise<void> {
    await this.transition(row, 'retrying', {
      ...CLEARED,
      ...reasonFields(reason),
      status: 'retrying',
      nextAttemptAt,
    });
  }

  async markBlocked(row: LessonPipelineStage, reason: Reason, provider: CredentialProvider): Promise<void> {
    await this.transition(row, 'blocked_missing_key', {
      ...CLEARED,
      ...reasonFields(reason),
      status: 'blocked_missing_key',
      blockedProvider: provider,
    });
  }

  async markFailed(row: LessonPipelineStage, reason: Reason, now: Date): Promise<void> {
    await this.transition(
      row,
      'failed',
      { ...CLEARED, ...reasonFields(reason), status: 'failed', finishedAt: now },
      { failureCode: reason.reasonCode, failureReason: reason.reason },
    );
  }

  /**
   * The completing transaction: claims completion for this run, runs the
   * handler's writes, queues the next stage and moves the pointer onto it.
   * Any throw rolls all of it back, so a partial result never persists.
   */
  async complete(
    row: LessonPipelineStage,
    write: (tx: Prisma.TransactionClient) => Promise<void>,
    now: Date,
  ): Promise<LessonPipelineStage | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const claimed = await tx.lessonPipelineStage.updateMany({
          where: { id: row.id, run: row.run, status: 'running' },
          data: { ...CLEARED, status: 'completed', finishedAt: now },
        });
        if (claimed.count === 0) {
          throw new StaleRunError();
        }

        await write(tx);

        const next = nextStageAfter(row.stage as QueuedPipelineStage);
        if (next) {
          return this.queueStage(row.branchId, next, now, tx);
        }
        // No next stage: this was the pipeline's last (plan_generation, F15).
        // The branch pointer has nowhere else to go, so it settles here.
        await this.movePointer(tx, row.branchId, row.stage, 'completed');
        return null;
      },
      { timeout: COMPLETE_TRANSACTION_TIMEOUT_MS },
    );
  }

  /**
   * Ends a pending stage whose job died while the stage was mid-run — the
   * runner itself failed to record an outcome. It is failed as
   * `internal_error` for the owner to retry, never re-run automatically:
   * a fault that repeats would otherwise spend the owner's quota forever.
   */
  async abandon(row: LessonPipelineStage, reason: Reason, now: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const moved = await tx.lessonPipelineStage.updateMany({
        where: { id: row.id, run: row.run, status: { in: ['running', 'retrying'] } },
        data: { ...CLEARED, ...reasonFields(reason), status: 'failed', finishedAt: now },
      });
      if (moved.count === 0) {
        return false;
      }
      await this.movePointer(tx, row.branchId, row.stage, 'failed', {
        failureCode: reason.reasonCode,
        failureReason: reason.reason,
      });
      return true;
    });
  }

  /** Blocked → queued with the next run, once the owner has a usable key. Null if it moved on meanwhile. */
  async resume(row: LessonPipelineStage, now: Date): Promise<LessonPipelineStage | null> {
    return this.requeue(row, 'blocked_missing_key', now);
  }

  /** Failed → queued with the next run, for the owner's manual retry. Null if it moved on meanwhile. */
  async requeueFailed(row: LessonPipelineStage, now: Date): Promise<LessonPipelineStage | null> {
    return this.requeue(row, 'failed', now);
  }

  private async requeue(
    row: LessonPipelineStage,
    from: 'blocked_missing_key' | 'failed',
    now: Date,
  ): Promise<LessonPipelineStage | null> {
    return this.prisma.$transaction(async (tx) => {
      const moved = await tx.lessonPipelineStage.updateMany({
        where: { id: row.id, run: row.run, status: from },
        data: {
          ...CLEARED,
          status: 'queued',
          run: { increment: 1 },
          queuedAt: now,
          startedAt: null,
          progressDone: null,
          progressTotal: null,
        },
      });
      if (moved.count === 0) {
        return null;
      }
      await this.movePointer(tx, row.branchId, row.stage, 'queued');
      return tx.lessonPipelineStage.findUniqueOrThrow({ where: { id: row.id } });
    });
  }

  /**
   * Runs `write` in a transaction, but only while `row`'s run still owns the
   * stage and it is still `running` — locked `FOR UPDATE` so a concurrent
   * completion or requeue cannot slip in between the check and the write.
   * F10 uses this to persist one excerpt's outcome as it lands, outside the
   * stage's own completing transaction, without losing the run guard that
   * makes a stale duplicate harmless.
   */
  async withinRun<T>(
    row: Pick<LessonPipelineStage, 'id' | 'run'>,
    write: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const [current] = await tx.$queryRaw<
        Array<{ run: number; status: string }>
      >`SELECT run, status FROM lesson_pipeline_stages WHERE id = ${row.id}::uuid FOR UPDATE`;
      if (!current || current.run !== row.run || current.status !== 'running') {
        throw new StaleRunError();
      }
      return write(tx);
    });
  }

  /** Sets the run's progress counter under the same guard as `withinRun`. Reset to null when the stage is re-queued. */
  async setProgress(row: Pick<LessonPipelineStage, 'id' | 'run'>, done: number, total: number): Promise<void> {
    await this.withinRun(row, (tx) =>
      tx.lessonPipelineStage.update({
        where: { id: row.id },
        data: { progressDone: done, progressTotal: total },
      }),
    );
  }

  private async transition(
    row: LessonPipelineStage,
    branchStatus: 'retrying' | 'blocked_missing_key' | 'failed',
    data: Prisma.LessonPipelineStageUpdateManyMutationInput,
    failure: { failureCode: string | null; failureReason: string | null } = {
      failureCode: null,
      failureReason: null,
    },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.lessonPipelineStage.updateMany({
        where: { id: row.id, run: row.run, status: 'running' },
        data,
      });
      if (moved.count === 0) {
        return;
      }
      await this.movePointer(tx, row.branchId, row.stage, branchStatus, failure);
    });
  }

  private async movePointer(
    client: Prisma.TransactionClient | PrismaService,
    branchId: string,
    stage: string,
    status: 'queued' | 'running' | 'retrying' | 'blocked_missing_key' | 'failed' | 'completed',
    failure: { failureCode: string | null; failureReason: string | null } = {
      failureCode: null,
      failureReason: null,
    },
  ): Promise<void> {
    await client.lessonPipelineBranch.update({
      where: { id: branchId },
      data: { stage, status, ...failure },
    });
  }
}
