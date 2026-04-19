import { randomUUID } from "node:crypto";
import type { VideoJob } from "@prisma/client";
import { prisma } from "@/app/_lib/db";
import { computeNextRunAt } from "./backoff";
import { PipelineError, type StageName, type VideoStatus } from "./errors";
import {
  claimDueJobs,
  failJob,
  releaseStaleLeases,
  rescheduleJob,
  resolveLeaseTimeoutMs,
} from "./queue";
import { STAGE_ENTRY_STATUS } from "./errors";
import { runValidateStage } from "./stages/validate";
import { runTranscribeStage } from "./stages/transcribe";
import { runSummarizeStage } from "./stages/summarize";
import { transitionStatus } from "./status";

export type WorkerOptions = {
  concurrency?: number;
  pollIntervalMs?: number;
  leaseTimeoutMs?: number;
};

export type Worker = {
  start(): Promise<void>;
  stop(): Promise<void>;
  runOnce(): Promise<number>;
  isRunning(): boolean;
};

function logEvent(payload: Record<string, unknown>): void {
  try {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ scope: "pipeline", ...payload }));
  } catch {
    // ignore logging failures
  }
}

async function dispatchStage(
  stage: StageName,
  context: Parameters<typeof runValidateStage>[0],
): Promise<void> {
  switch (stage) {
    case "validate":
      return runValidateStage(context);
    case "transcribe":
      return runTranscribeStage(context);
    case "summarize":
      return runSummarizeStage(context);
  }
}

async function processJob(job: VideoJob): Promise<void> {
  const stage = job.stage as StageName;
  const attemptNumber = job.attempt + 1; // 1-based for reporting
  const video = await prisma.video.findUnique({ where: { id: job.videoId } });
  if (!video) {
    await prisma.videoJob.delete({ where: { id: job.id } }).catch(() => {});
    logEvent({ level: "warn", msg: "job_video_missing", videoId: job.videoId });
    return;
  }
  const started = Date.now();
  logEvent({
    level: "info",
    msg: "stage_start",
    videoId: job.videoId,
    stage,
    attempt: attemptNumber,
  });

  try {
    await dispatchStage(stage, {
      videoId: job.videoId,
      userId: video.userId,
      attempt: attemptNumber,
    });
    logEvent({
      level: "info",
      msg: "stage_success",
      videoId: job.videoId,
      stage,
      attempt: attemptNumber,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    await handleStageFailure(job, stage, attemptNumber, err);
  }
}

async function handleStageFailure(
  job: VideoJob,
  stage: StageName,
  attemptNumber: number,
  err: unknown,
): Promise<void> {
  const perr =
    err instanceof PipelineError
      ? err
      : new PipelineError(
          "PIPE_INTERNAL",
          (err as Error)?.message ?? "Unknown pipeline error",
          false,
        );

  const entryStatus = STAGE_ENTRY_STATUS[stage] as VideoStatus;
  const stillRetriable = perr.retriable && attemptNumber < 3;
  const nextRunAt = stillRetriable ? computeNextRunAt(attemptNumber) : null;

  if (nextRunAt != null) {
    logEvent({
      level: "warn",
      msg: "stage_retriable_failure",
      videoId: job.videoId,
      stage,
      attempt: attemptNumber,
      code: perr.code,
      error: perr.message,
      nextRunAt: nextRunAt.toISOString(),
    });
    await rescheduleJob({
      videoId: job.videoId,
      nextAttempt: attemptNumber,
      nextRunAt,
      errorCode: perr.code,
      errorMessage: perr.message,
    });
    return;
  }

  logEvent({
    level: "error",
    msg: "stage_final_failure",
    videoId: job.videoId,
    stage,
    attempt: attemptNumber,
    code: perr.code,
    error: perr.message,
  });

  try {
    await transitionStatus({
      videoId: job.videoId,
      expectedFrom: entryStatus,
      to: "failed",
      stage,
      attempt: attemptNumber,
      errorCode: perr.code,
    });
  } catch (transitionErr) {
    logEvent({
      level: "error",
      msg: "transition_failed_error",
      videoId: job.videoId,
      error: (transitionErr as Error)?.message,
    });
  }
  await failJob({
    videoId: job.videoId,
    errorCode: perr.code,
    errorMessage: perr.message,
  });
}

export function createWorker(options: WorkerOptions = {}): Worker {
  const concurrency = options.concurrency ?? resolveIntEnv("VIDEOMAX_PIPELINE_CONCURRENCY", 2);
  const pollIntervalMs =
    options.pollIntervalMs ?? resolveIntEnv("VIDEOMAX_PIPELINE_POLL_INTERVAL_MS", 2000);
  const leaseTimeoutMs = options.leaseTimeoutMs ?? resolveLeaseTimeoutMs();

  let running = false;
  let loopTimer: NodeJS.Timeout | null = null;
  let tickInFlight: Promise<number> | null = null;

  async function tick(): Promise<number> {
    const leaseId = randomUUID();
    try {
      await releaseStaleLeases(leaseTimeoutMs).catch((err) => {
        logEvent({ level: "error", msg: "release_stale_leases_error", error: (err as Error).message });
        return 0;
      });
      const jobs = await claimDueJobs(concurrency, leaseId);
      if (jobs.length === 0) return 0;
      await Promise.all(jobs.map((j) => processJob(j).catch((err) => {
        logEvent({ level: "error", msg: "process_job_error", videoId: j.videoId, error: (err as Error).message });
      })));
      return jobs.length;
    } catch (err) {
      logEvent({ level: "error", msg: "tick_error", error: (err as Error).message });
      return 0;
    }
  }

  function scheduleNext(delay: number): void {
    if (!running) return;
    loopTimer = setTimeout(() => {
      tickInFlight = tick().finally(() => {
        tickInFlight = null;
        scheduleNext(pollIntervalMs);
      });
    }, delay);
  }

  return {
    async start() {
      if (running) return;
      running = true;
      logEvent({ level: "info", msg: "worker_start", concurrency, pollIntervalMs });
      scheduleNext(0);
    },
    async stop() {
      running = false;
      if (loopTimer) {
        clearTimeout(loopTimer);
        loopTimer = null;
      }
      if (tickInFlight) {
        await tickInFlight.catch(() => undefined);
      }
      logEvent({ level: "info", msg: "worker_stop" });
    },
    async runOnce() {
      return tick();
    },
    isRunning() {
      return running;
    },
  };
}

function resolveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
