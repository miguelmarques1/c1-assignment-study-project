import { prisma } from "@/app/_lib/db";
import type { VideoJob } from "@prisma/client";
import type { StageName } from "./errors";

export function resolveLeaseTimeoutMs(): number {
  const raw = process.env.VIDEOMAX_PIPELINE_LEASE_TIMEOUT_MS;
  if (!raw) return 15 * 60_000;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15 * 60_000;
}

export async function enqueuePipelineJob(videoId: string): Promise<VideoJob> {
  const existing = await prisma.videoJob.findUnique({ where: { videoId } });
  if (existing) return existing;
  try {
    return await prisma.videoJob.create({
      data: {
        videoId,
        stage: "validate",
        attempt: 0,
        scheduledAt: new Date(),
      },
    });
  } catch {
    // Race: another caller inserted concurrently. Return the existing row.
    const row = await prisma.videoJob.findUnique({ where: { videoId } });
    if (!row) throw new Error(`Failed to enqueue job for video ${videoId}`);
    return row;
  }
}

type RawJobRow = {
  id: string;
  video_id: string;
  stage: string;
  attempt: number;
  scheduled_at: Date | string;
  leased_at: Date | string | null;
  lease_id: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  failed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export async function claimDueJobs(
  limit: number,
  leaseId: string,
  now: Date = new Date(),
): Promise<VideoJob[]> {
  // Postgres queue pattern with FOR UPDATE SKIP LOCKED to guarantee disjoint claims.
  const rows = await prisma.$queryRawUnsafe<RawJobRow[]>(
    `UPDATE "video_job" AS j
     SET "leased_at" = $1, "lease_id" = $2, "updated_at" = $1
     WHERE "id" IN (
       SELECT "id" FROM "video_job"
       WHERE "scheduled_at" <= $1 AND "leased_at" IS NULL AND "failed_at" IS NULL
       ORDER BY "scheduled_at" ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $3
     )
     RETURNING *`,
    now,
    leaseId,
    limit,
  );
  return rows.map(coerceJobRow);
}

export async function completeJob(videoId: string): Promise<void> {
  await prisma.videoJob.deleteMany({ where: { videoId } });
}

export async function rescheduleJob(params: {
  videoId: string;
  nextAttempt: number;
  nextRunAt: Date;
  errorCode: string;
  errorMessage: string;
}): Promise<void> {
  await prisma.videoJob.update({
    where: { videoId: params.videoId },
    data: {
      attempt: params.nextAttempt,
      scheduledAt: params.nextRunAt,
      leasedAt: null,
      leaseId: null,
      lastErrorCode: params.errorCode,
      lastErrorMessage: truncate(params.errorMessage, 500),
    },
  });
}

export async function failJob(params: {
  videoId: string;
  errorCode: string;
  errorMessage: string;
  now?: Date;
}): Promise<void> {
  await prisma.videoJob.update({
    where: { videoId: params.videoId },
    data: {
      leasedAt: null,
      leaseId: null,
      failedAt: params.now ?? new Date(),
      lastErrorCode: params.errorCode,
      lastErrorMessage: truncate(params.errorMessage, 500),
    },
  });
}

export async function advanceJobStage(params: {
  videoId: string;
  nextStage: StageName;
}): Promise<void> {
  await prisma.videoJob.update({
    where: { videoId: params.videoId },
    data: {
      stage: params.nextStage,
      attempt: 0,
      scheduledAt: new Date(),
      leasedAt: null,
      leaseId: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });
}

export async function releaseStaleLeases(
  leaseTimeoutMs: number = resolveLeaseTimeoutMs(),
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - leaseTimeoutMs);
  const res = await prisma.videoJob.updateMany({
    where: { leasedAt: { lt: cutoff } },
    data: { leasedAt: null, leaseId: null },
  });
  return res.count;
}

export async function resetJobForRetry(videoId: string): Promise<VideoJob> {
  return prisma.videoJob.update({
    where: { videoId },
    data: {
      attempt: 0,
      scheduledAt: new Date(),
      leasedAt: null,
      leaseId: null,
      failedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });
}

export async function getJobForVideo(videoId: string): Promise<VideoJob | null> {
  return prisma.videoJob.findUnique({ where: { videoId } });
}

function truncate(s: string, n: number): string {
  if (!s) return s;
  return s.length <= n ? s : s.slice(0, n);
}

function coerceJobRow(row: RawJobRow): VideoJob {
  return {
    id: row.id,
    videoId: row.video_id,
    stage: row.stage,
    attempt: row.attempt,
    scheduledAt: toDate(row.scheduled_at),
    leasedAt: toDateOrNull(row.leased_at),
    leaseId: row.lease_id,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    failedAt: toDateOrNull(row.failed_at),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function toDate(v: unknown): Date {
  return v instanceof Date ? v : new Date(v as string);
}
function toDateOrNull(v: unknown): Date | null {
  if (v == null) return null;
  return v instanceof Date ? v : new Date(v as string);
}
