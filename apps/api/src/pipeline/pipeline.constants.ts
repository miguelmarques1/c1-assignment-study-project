import type { PipelineStage } from '@english-quest/shared';

/**
 * Fixed pipeline values, kept here once so the processor, the drain, the
 * launch and the tests never re-spell them.
 */

/** The one queue every post-lesson stage from transcription onward runs on. */
export const PIPELINE_QUEUE = 'lesson-pipeline';

/**
 * The order a branch walks. `recording` is F07's and never runs on the
 * queue; each later feature appends its stage here and widens the checks.
 * A stage is appended one feature early, so the stage before it has
 * somewhere to leave the branch: F09 added `pronunciation_assessment`,
 * where a selected branch waits for F10's handler, F10 added
 * `lesson_analysis`, where an assessed branch waits for F11's, F11 added
 * `profile_update`, where an analysed branch waits for F12's, and F12 adds
 * `plan_generation`, where a profiled branch waits for F15's (which also
 * adds the pipeline's terminal status).
 */
export const PIPELINE_STAGE_ORDER: readonly PipelineStage[] = [
  'recording',
  'transcription',
  'excerpt_selection',
  'pronunciation_assessment',
  'lesson_analysis',
  'profile_update',
  'plan_generation',
];

/** Stages that are rows in `lesson_pipeline_stages` and run through a handler. */
export type QueuedPipelineStage = Exclude<PipelineStage, 'recording'>;

/** The stage a branch moves to once `stage` completes, or null at the end of the known pipeline. */
export function nextStageAfter(stage: PipelineStage): QueuedPipelineStage | null {
  const index = PIPELINE_STAGE_ORDER.indexOf(stage);
  const next = PIPELINE_STAGE_ORDER[index + 1];
  return (next as QueuedPipelineStage | undefined) ?? null;
}

/** The supported participant ceiling (F05), so one lesson's branches all run at once. */
export const PIPELINE_WORKER_CONCURRENCY = 4;

/** Well inside the PRD's "resumes within 60 seconds" once a key is saved. */
export const PIPELINE_DRAIN_INTERVAL_MS = 15_000;

/** Completed jobs are kept a day and failed ones a week, for inspection; Postgres is the record. */
export const PIPELINE_JOB_RETENTION = {
  removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
  removeOnFail: { age: 7 * 24 * 60 * 60 },
} as const;

/**
 * Deterministic, so adding the same stage run twice is a no-op. BullMQ
 * refuses `:` in custom ids (it separates its own Redis keys), hence dashes.
 */
export function pipelineJobId(stage: QueuedPipelineStage, branchId: string, run: number): string {
  return `${stage}-${branchId}-${run}`;
}

/**
 * How long shutdown waits on the queue's Redis connections. A Redis that is
 * down would otherwise hold shutdown forever: BullMQ's graceful close sends
 * `QUIT`, which waits in ioredis's offline queue for a server that is gone.
 */
export const PIPELINE_SHUTDOWN_TIMEOUT_MS = 5_000;

/** Resolves when `work` settles or the shutdown budget runs out, whichever comes first. Never rejects. */
export async function withinShutdownBudget(work: Promise<unknown>): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    work.catch(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, PIPELINE_SHUTDOWN_TIMEOUT_MS);
    }),
  ]);
  clearTimeout(timer);
}

/** Statuses a stage row can be in while it still needs its job. */
export const PENDING_STAGE_STATUSES = ['queued', 'running', 'retrying'] as const;

/** The sentence a stage fails with when the runner itself could not classify what went wrong. */
export const INTERNAL_ERROR_REASON = 'Something went wrong while processing this stage.';
