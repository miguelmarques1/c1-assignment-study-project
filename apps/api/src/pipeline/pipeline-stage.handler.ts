import type {
  BlockedReasonCode,
  CredentialProvider,
  StageFailureCode,
} from '@english-quest/shared';
import type { Prisma } from '@prisma/client';

import type { QueuedPipelineStage } from './pipeline.constants';

/**
 * `delaysMs[i]` is the wait before attempt `i + 2`, so a policy of four
 * attempts carries three delays. Each stage owns its schedule: the PRD gives
 * transcription 30 s / 2 min / 8 min and analysis 1 / 5 / 15 min.
 */
export interface StageRetryPolicy {
  attempts: number;
  delaysMs: readonly number[];
}

export interface StageRunContext {
  branchId: string;
  lessonId: string;
  userId: string;
  run: number;
  /** 1-based attempt within this run. */
  attempt: number;
  /**
   * Commits the handler's result in the same transaction that completes the
   * stage, queues the next one and moves the branch pointer — and only while
   * this run still owns the stage, so a stalled duplicate commits nothing.
   */
  complete(write: (tx: Prisma.TransactionClient) => Promise<void>): Promise<void>;
  /**
   * Runs `write` in a transaction that commits only while this run still
   * owns the stage, throwing `StaleRunError` otherwise. For state that has
   * to survive between attempts and between runs — outside `complete`'s own
   * transaction, but under the same ownership guard.
   */
  withinRun<T>(write: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
  /** Reports progress on the current run, under the same guard as `withinRun`. Reset to `null` when the stage is re-queued. */
  reportProgress(done: number, total: number): Promise<void>;
}

/**
 * What a stage declares to the runner. The handler does its work and raises
 * one of the typed outcomes below; the runner owns every state transition,
 * retry and job, so no stage re-implements them.
 */
export interface PipelineStageHandler {
  readonly stage: QueuedPipelineStage;
  /** The credential the stage runs under: a blocked stage resumes when this key becomes usable. */
  readonly provider: CredentialProvider | null;
  readonly retryPolicy: StageRetryPolicy;
  run(context: StageRunContext): Promise<void>;
}

abstract class StageOutcomeError extends Error {
  constructor(
    readonly reasonCode: string,
    readonly reason: string,
    readonly providerMessage: string | null = null,
  ) {
    super(reason);
  }
}

/** No usable key: the stage waits for its owner instead of failing. Never retried. */
export class StageBlockedError extends StageOutcomeError {
  override readonly name = 'StageBlockedError';
  constructor(
    override readonly reasonCode: BlockedReasonCode,
    reason: string,
    providerMessage: string | null = null,
  ) {
    super(reasonCode, reason, providerMessage);
  }
}

/** Worth another attempt on the stage's schedule; fails with this reason once attempts run out. */
export class StageRetryableError extends StageOutcomeError {
  override readonly name = 'StageRetryableError';
  constructor(
    override readonly reasonCode: StageFailureCode,
    reason: string,
    providerMessage: string | null = null,
  ) {
    super(reasonCode, reason, providerMessage);
  }
}

/** Retrying would change nothing: fails now. The owner can still retry by hand. */
export class StageFailedError extends StageOutcomeError {
  override readonly name = 'StageFailedError';
  constructor(
    override readonly reasonCode: StageFailureCode,
    reason: string,
    providerMessage: string | null = null,
  ) {
    super(reasonCode, reason, providerMessage);
  }
}

/** The delay before the next attempt, or null when `attempt` was the last one the policy allows. */
export function retryDelayFor(policy: StageRetryPolicy, attempt: number): number | null {
  if (attempt >= policy.attempts) {
    return null;
  }
  const delays = policy.delaysMs;
  return delays[attempt - 1] ?? delays[delays.length - 1] ?? 0;
}
