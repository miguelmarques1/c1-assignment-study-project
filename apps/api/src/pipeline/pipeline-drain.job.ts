import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { LessonPipelineStage } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
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
}

/** A key the provider has not refused. `unverified` counts: the probe could not reach the provider, which says nothing against the key. */
const USABLE_CREDENTIAL_STATUSES = ['valid', 'unverified'];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Keeps Postgres and the queue in agreement, whatever happened in between:
 *
 * - a branch F07 left at `transcription`/`queued` before this feature
 *   existed gets its stage row;
 * - a blocked stage whose owner now has a usable key for its provider goes
 *   back to `queued` with the next run — saving a key in settings, from
 *   either client, or the nightly revalidation re-enabling one, needs no
 *   call into the pipeline;
 * - every pending stage with a registered handler has a live job, which
 *   recovers an add that failed at launch or a Redis that lost its data.
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
    const enqueued = await this.ensureJobs();
    return { backfilled, resumed, enqueued };
  }

  private async backfill(now: Date): Promise<number> {
    const orphans = await this.prisma.lessonPipelineBranch.findMany({
      where: { stage: 'transcription', status: 'queued', stages: { none: { stage: 'transcription' } } },
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

  private async ensureJobs(): Promise<number> {
    const pending: LessonPipelineStage[] = await this.prisma.lessonPipelineStage.findMany({
      where: { status: { in: [...PENDING_STAGE_STATUSES] } },
    });

    let count = 0;
    for (const row of pending) {
      if (!this.registry.has(row.stage)) {
        continue;
      }
      await this.safely(`ensure job for stage ${row.id}`, async () => {
        if (await this.queue.ensureJob(row.branchId, row.stage as QueuedPipelineStage, row.run)) {
          count += 1;
        }
      });
    }
    return count;
  }

  private async safely(label: string, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.logger.warn(`Pipeline drain could not ${label}: ${errorMessage(error)}`);
    }
  }
}
