import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type BeforeApplicationShutdown, type OnApplicationBootstrap } from '@nestjs/common';
import { DelayedError, type Job } from 'bullmq';

import {
  INTERNAL_ERROR_REASON,
  PIPELINE_QUEUE,
  PIPELINE_WORKER_CONCURRENCY,
  withinShutdownBudget,
} from './pipeline.constants';
import {
  StageBlockedError,
  StageFailedError,
  StageRetryableError,
  retryDelayFor,
  type PipelineStageHandler,
} from './pipeline-stage.handler';
import { PipelineStageRegistry } from './pipeline-stage.registry';
import { PipelineQueueService, type PipelineJobData } from './pipeline-queue.service';
import { PipelineStateService, StaleRunError, type StageWithBranch } from './pipeline-state.service';

export type PipelineJobOutcome = 'completed' | 'retrying' | 'blocked' | 'failed' | 'stale' | 'no_handler';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The one worker every stage runs on. It owns the bookkeeping — claiming a
 * run, turning a handler's typed outcome into a stage state, the per-stage
 * backoff, queuing the next stage — so a handler only does its own work.
 *
 * Retries are scheduled here rather than by BullMQ's `attempts`/`backoff`:
 * the job is moved to delayed with the stage's own delay and keeps its id,
 * which lets the schedule come from the injected registry (and the
 * integration suites shorten it) instead of a static decorator option.
 *
 * `autorun` is off so no job is taken before every module has registered
 * its handler; the worker starts at application bootstrap. It is closed
 * with `force` before shutdown: a job still in flight is abandoned to
 * BullMQ's stalled check and re-delivered on the next boot, which the run
 * guard makes safe — and a Redis that is down cannot hold shutdown hostage.
 */
@Processor(PIPELINE_QUEUE, { concurrency: PIPELINE_WORKER_CONCURRENCY, autorun: false })
export class PipelineProcessor extends WorkerHost implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(PipelineProcessor.name);

  constructor(
    private readonly registry: PipelineStageRegistry,
    private readonly state: PipelineStateService,
    private readonly queue: PipelineQueueService,
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    this.worker.run().catch((error: unknown) => {
      this.logger.error(`Pipeline worker stopped: ${errorMessage(error)}`);
    });
  }

  async beforeApplicationShutdown(): Promise<void> {
    await withinShutdownBudget(this.worker.close(true));
  }

  /**
   * BullMQ emits connection trouble as `error` events; without a listener
   * the worker can stop taking jobs. It reconnects by itself, so a warning
   * is all this needs.
   */
  @OnWorkerEvent('error')
  onWorkerError(error: Error): void {
    this.logger.warn(`Pipeline worker: ${error.message}`);
  }

  async process(job: Job<PipelineJobData>, token?: string): Promise<PipelineJobOutcome> {
    const { branchId, stage, run } = job.data;

    const handler = this.registry.get(stage);
    if (!handler) {
      this.logger.warn(`No handler registered for the ${stage} stage; job ${job.id} left for the drain.`);
      return 'no_handler';
    }

    const row = await this.state.findStage(branchId, stage);
    if (!row || row.run !== run || !['queued', 'running', 'retrying'].includes(row.status)) {
      return 'stale';
    }

    const claimed = await this.state.markRunning(row, new Date());
    if (!claimed) {
      return 'stale';
    }
    const attempt = Math.max(job.attemptsStarted, 1);

    try {
      let completed = false;
      await handler.run({
        branchId,
        lessonId: row.branch.lessonId,
        userId: row.branch.userId,
        run,
        attempt,
        complete: async (write) => {
          const next = await this.state.complete(claimed, write, new Date());
          completed = true;
          if (next && this.registry.has(next.stage)) {
            // A failed add is not the branch's problem: the row is already
            // queued, and the drain adds any pending stage's missing job.
            await this.queue.enqueue(branchId, next.stage, next.run).catch((error: unknown) => {
              this.logger.warn(`Could not queue ${next.stage} for branch ${branchId}: ${errorMessage(error)}`);
            });
          }
        },
      });
      if (!completed) {
        throw new Error(`The ${stage} handler returned without completing the stage.`);
      }
      return 'completed';
    } catch (error) {
      return this.settle(job, token, handler, { ...row, ...claimed, branch: row.branch }, attempt, error);
    }
  }

  private async settle(
    job: Job<PipelineJobData>,
    token: string | undefined,
    handler: PipelineStageHandler,
    row: StageWithBranch,
    attempt: number,
    error: unknown,
  ): Promise<PipelineJobOutcome> {
    const now = new Date();

    if (error instanceof StaleRunError) {
      return 'stale';
    }

    if (error instanceof StageBlockedError && handler.provider) {
      await this.state.markBlocked(row, error, handler.provider);
      return 'blocked';
    }

    if (error instanceof StageFailedError) {
      await this.state.markFailed(row, error, now);
      return 'failed';
    }

    const reason =
      error instanceof StageRetryableError
        ? error
        : { reasonCode: 'internal_error', reason: INTERNAL_ERROR_REASON, providerMessage: null };
    if (!(error instanceof StageRetryableError)) {
      this.logger.error(
        `Unclassified failure in ${row.stage} for branch ${row.branchId} (attempt ${attempt}): ${errorMessage(error)}`,
      );
    }

    const delay = retryDelayFor(this.registry.retryPolicy(handler), attempt);
    if (delay === null) {
      await this.state.markFailed(row, reason, now);
      return 'failed';
    }

    const nextAttemptAt = new Date(now.getTime() + delay);
    await this.state.markRetrying(row, reason, nextAttemptAt);
    await job.moveToDelayed(nextAttemptAt.getTime(), token);
    // Tells BullMQ the job was moved on purpose, not that it failed.
    throw new DelayedError();
  }
}
