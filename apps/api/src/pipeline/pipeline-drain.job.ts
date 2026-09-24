import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { LessonPipelineStage } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  INTERNAL_ERROR_REASON,
  PENDING_STAGE_STATUSES,
  PIPELINE_DRAIN_INTERVAL_MS,
  type QueuedPipelineStage,
} from './pipeline.constants';
import { PipelineStageRegistry } from './pipeline-stage.registry';
import { PipelineQueueService } from './pipeline-queue.service';
import { PipelineStateService } from './pipeline-state.service';

export interface DrainResult {
  backfilled: number;
  resumed: number;
  enqueued: number;
  abandoned: number;
}

/** Job states that mean the run is still in BullMQ's hands. */
const LIVE_JOB_STATES = new Set(['waiting', 'active', 'delayed', 'prioritized', 'waiting-children']);

/** A key the provider has not refused. `unverified` counts: the probe could not reach the provider, which says nothing against the key. */
const USABLE_CREDENTIAL_STATUSES = ['valid', 'unverified'];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Keeps Postgres and the queue in agreement, whatever happened in between:
 *
 * - a branch F07 launched without a transcription stage row gets one —
 *   branches recorded before this feature existed, and any launch whose
 *   own write failed (F07 leaves a launched branch at `recording`/`queued`
 *   with `launched_at` set; the launch is what moves it on);
 * - a blocked stage whose owner now has a usable key for its provider goes
 *   back to `queued` with the next run — saving a key in settings, from
 *   either client, or the nightly revalidation re-enabling one, needs no
 *   call into the pipeline;
 * - every pending stage with a registered handler has a live job, which
 *   recovers an add that failed at launch or a Redis that lost its data —
 *   except a stage whose job failed mid-run: that means the runner could
 *   not record an outcome, and re-running it would repeat the provider
 *   call on every tick, so it is failed as `internal_error` instead.
 *
 * Follows `LessonLifecycleJob`: one row failing never stops the sweep.
 */
@Injectable()
export class PipelineDrainJob {
  private readonly logger = new Logger(PipelineDrainJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PipelineStageRegistry,
    private readonly state: PipelineStateService,
    private readonly queue: PipelineQueueService,
  ) {}

  @Interval('pipeline-drain', PIPELINE_DRAIN_INTERVAL_MS)
  async run(now: Date = new Date()): Promise<DrainResult> {
    const backfilled = await this.backfill(now);
    const resumed = await this.resumeBlocked(now);
    const { enqueued, abandoned } = await this.ensureJobs(now);
    return { backfilled, resumed, enqueued, abandoned };
  }

  private async backfill(now: Date): Promise<number> {
    // `launched_at` is set only after F07's launch call returns, so a branch
    // whose launch is still in flight is never picked up twice.
    const orphans = await this.prisma.lessonPipelineBranch.findMany({
      where: {
        launchedAt: { not: null },
        status: 'queued',
        stage: { in: ['recording', 'transcription'] },
        stages: { none: { stage: 'transcription' } },
      },
      select: { id: true },
    });

    let count = 0;
    for (const branch of orphans) {
      await this.safely(`backfill branch ${branch.id}`, async () => {
        await this.state.ensureStage(branch.id, 'transcription', now);
        count += 1;
      });
    }
    return count;
  }

  private async resumeBlocked(now: Date): Promise<number> {
    const blocked = await this.prisma.lessonPipelineStage.findMany({
      where: { status: 'blocked_missing_key' },
      include: { branch: { select: { userId: true } } },
    });

    let count = 0;
    for (const row of blocked) {
      if (!row.blockedProvider) {
        continue;
      }
      await this.safely(`resume stage ${row.id}`, async () => {
        const credential = await this.prisma.userCredential.findUnique({
          where: { userId_provider: { userId: row.branch.userId, provider: row.blockedProvider! } },
          select: { status: true },
        });
        if (!credential || !USABLE_CREDENTIAL_STATUSES.includes(credential.status)) {
          return;
        }
        if (await this.state.resume(row, now)) {
          count += 1;
        }
      });
    }
    return count;
  }

  private async ensureJobs(now: Date): Promise<{ enqueued: number; abandoned: number }> {
    const pending: LessonPipelineStage[] = await this.prisma.lessonPipelineStage.findMany({
      where: { status: { in: [...PENDING_STAGE_STATUSES] } },
    });

    let enqueued = 0;
    let abandoned = 0;
    for (const row of pending) {
      if (!this.registry.has(row.stage)) {
        continue;
      }
      const stage = row.stage as QueuedPipelineStage;
      await this.safely(`ensure job for stage ${row.id}`, async () => {
        const state = await this.queue.jobState(row.branchId, stage, row.run);
        if (LIVE_JOB_STATES.has(state)) {
          return;
        }
        const diedMidRun = (state === 'failed' || state === 'unknown') && row.status !== 'queued';
        if (diedMidRun) {
          this.logger.error(`Stage ${row.id} (${row.stage}) lost its job mid-run; failing it as internal_error.`);
          const reason = { reasonCode: 'internal_error', reason: INTERNAL_ERROR_REASON, providerMessage: null };
          if (await this.state.abandon(row, reason, now)) {
            abandoned += 1;
          }
          return;
        }
        // Missing (never added, or Redis lost it), or finished without
        // recording an outcome (no handler yet when it ran): add it again.
        await this.queue.replaceJob(row.branchId, stage, row.run);
        enqueued += 1;
      });
    }
    return { enqueued, abandoned };
  }

  private async safely(label: string, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.logger.warn(`Pipeline drain could not ${label}: ${errorMessage(error)}`);
    }
  }
}
