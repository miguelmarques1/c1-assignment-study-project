import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, type BeforeApplicationShutdown } from '@nestjs/common';
import type { JobState, Queue } from 'bullmq';

import {
  PIPELINE_JOB_RETENTION,
  PIPELINE_QUEUE,
  pipelineJobId,
  withinShutdownBudget,
  type QueuedPipelineStage,
} from './pipeline.constants';

/** Everything a job carries. The rest is read fresh from Postgres when it runs, so a delayed retry never acts on stale data. */
export interface PipelineJobData {
  branchId: string;
  stage: QueuedPipelineStage;
  run: number;
}

@Injectable()
export class PipelineQueueService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(PipelineQueueService.name);

  constructor(@InjectQueue(PIPELINE_QUEUE) private readonly queue: Queue<PipelineJobData>) {
    // Connection trouble arrives as `error` events; an emitter with no
    // listener would throw. Adds are awaited where they happen, so a
    // warning is all the event itself needs.
    this.queue.on('error', (error: Error) => this.logger.warn(`Pipeline queue: ${error.message}`));
  }

  /**
   * Drops the connection before the module's own graceful close runs, so
   * that close has nothing left to wait on when Redis is unreachable.
   */
  async beforeApplicationShutdown(): Promise<void> {
    await withinShutdownBudget(this.queue.disconnect());
  }

  /** Idempotent: the deterministic id makes a second add of the same run a no-op. */
  async enqueue(branchId: string, stage: QueuedPipelineStage, run: number): Promise<void> {
    await this.queue.add(stage, { branchId, stage, run }, { jobId: pipelineJobId(stage, branchId, run), ...PIPELINE_JOB_RETENTION });
  }

  /** Where a stage run's job is: a BullMQ state, or `missing` when Redis holds no such job. */
  async jobState(branchId: string, stage: QueuedPipelineStage, run: number): Promise<JobState | 'unknown' | 'missing'> {
    const job = await this.queue.getJob(pipelineJobId(stage, branchId, run));
    return job ? job.getState() : 'missing';
  }

  /** Adds the run's job, first removing a terminal one that would otherwise swallow the add. */
  async replaceJob(branchId: string, stage: QueuedPipelineStage, run: number): Promise<void> {
    await this.queue.getJob(pipelineJobId(stage, branchId, run)).then((job) => job?.remove());
    await this.enqueue(branchId, stage, run);
  }
}
