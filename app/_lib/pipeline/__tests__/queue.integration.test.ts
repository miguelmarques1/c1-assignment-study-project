import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/app/_lib/db";
import {
  claimDueJobs,
  completeJob,
  enqueuePipelineJob,
  failJob,
  releaseStaleLeases,
  rescheduleJob,
  resetJobForRetry,
} from "../queue";

async function makeUserAndVideo(suffix: string) {
  const user = await prisma.user.create({
    data: {
      email: `queue-${suffix}@example.com`,
      name: "Queue User",
      passwordHash: "$2a$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
  });
  const video = await prisma.video.create({
    data: {
      userId: user.id,
      title: "T",
      originalFilename: "x.mp4",
      sizeBytes: BigInt(1),
      containerFormat: "mp4",
      storagePath: `${user.id}/v/source.mp4`,
      status: "validating",
    },
  });
  return { user, video };
}

beforeEach(async () => {
  await prisma.videoEvent.deleteMany({});
  await prisma.videoJob.deleteMany({});
  await prisma.video.deleteMany({});
  await prisma.user.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("pipeline queue (integration)", () => {
  it("enqueue_creates_job_row_at_validate_stage", async () => {
    const { video } = await makeUserAndVideo("a");
    const job = await enqueuePipelineJob(video.id);
    expect(job.stage).toBe("validate");
    expect(job.attempt).toBe(0);
    expect(job.scheduledAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("enqueue_is_idempotent_and_returns_existing", async () => {
    const { video } = await makeUserAndVideo("b");
    const first = await enqueuePipelineJob(video.id);
    const second = await enqueuePipelineJob(video.id);
    expect(second.id).toBe(first.id);
    const count = await prisma.videoJob.count({ where: { videoId: video.id } });
    expect(count).toBe(1);
  });

  it("claim_due_jobs_returns_only_unleased_due_rows", async () => {
    const { video } = await makeUserAndVideo("c");
    await enqueuePipelineJob(video.id);
    const claimed = await claimDueJobs(5, randomUUID());
    expect(claimed.length).toBe(1);
    expect(claimed[0].videoId).toBe(video.id);
    expect(claimed[0].leasedAt).not.toBeNull();
  });

  it("claim_skips_rows_scheduled_in_the_future", async () => {
    const { video } = await makeUserAndVideo("d");
    await enqueuePipelineJob(video.id);
    await prisma.videoJob.update({
      where: { videoId: video.id },
      data: { scheduledAt: new Date(Date.now() + 60_000) },
    });
    const claimed = await claimDueJobs(5, randomUUID());
    expect(claimed.length).toBe(0);
  });

  it("reschedule_job_sets_attempt_and_scheduled_at_and_clears_lease", async () => {
    const { video } = await makeUserAndVideo("e");
    await enqueuePipelineJob(video.id);
    await claimDueJobs(1, randomUUID());
    const next = new Date(Date.now() + 60_000);
    await rescheduleJob({
      videoId: video.id,
      nextAttempt: 1,
      nextRunAt: next,
      errorCode: "PIPE_TRANSCRIBE_API",
      errorMessage: "transient",
    });
    const row = await prisma.videoJob.findUniqueOrThrow({ where: { videoId: video.id } });
    expect(row.attempt).toBe(1);
    expect(row.leasedAt).toBeNull();
    expect(row.lastErrorCode).toBe("PIPE_TRANSCRIBE_API");
    expect(Math.abs(row.scheduledAt.getTime() - next.getTime())).toBeLessThan(1000);
  });

  it("fail_job_marks_failed_and_clears_lease", async () => {
    const { video } = await makeUserAndVideo("f");
    await enqueuePipelineJob(video.id);
    await claimDueJobs(1, randomUUID());
    await failJob({
      videoId: video.id,
      errorCode: "PIPE_TRANSCRIBE_API",
      errorMessage: "giving up",
    });
    const row = await prisma.videoJob.findUniqueOrThrow({ where: { videoId: video.id } });
    expect(row.failedAt).not.toBeNull();
    expect(row.leasedAt).toBeNull();
    expect(row.lastErrorCode).toBe("PIPE_TRANSCRIBE_API");
  });

  it("reset_job_for_retry_restores_fresh_state", async () => {
    const { video } = await makeUserAndVideo("g");
    await enqueuePipelineJob(video.id);
    await prisma.videoJob.update({
      where: { videoId: video.id },
      data: {
        attempt: 3,
        failedAt: new Date(),
        lastErrorCode: "PIPE_TRANSCRIBE_API",
        lastErrorMessage: "gave up",
      },
    });
    await resetJobForRetry(video.id);
    const row = await prisma.videoJob.findUniqueOrThrow({ where: { videoId: video.id } });
    expect(row.attempt).toBe(0);
    expect(row.failedAt).toBeNull();
    expect(row.lastErrorCode).toBeNull();
    expect(row.scheduledAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("release_stale_leases_clears_expired_leases", async () => {
    const { video } = await makeUserAndVideo("h");
    await enqueuePipelineJob(video.id);
    await claimDueJobs(1, randomUUID());
    await prisma.videoJob.update({
      where: { videoId: video.id },
      data: { leasedAt: new Date(Date.now() - 30 * 60_000) },
    });
    const released = await releaseStaleLeases(15 * 60_000);
    expect(released).toBeGreaterThanOrEqual(1);
    const row = await prisma.videoJob.findUniqueOrThrow({ where: { videoId: video.id } });
    expect(row.leasedAt).toBeNull();
  });

  it("complete_job_deletes_row", async () => {
    const { video } = await makeUserAndVideo("i");
    await enqueuePipelineJob(video.id);
    await completeJob(video.id);
    const row = await prisma.videoJob.findUnique({ where: { videoId: video.id } });
    expect(row).toBeNull();
  });

  it("claim_due_jobs_skip_locked_prevents_double_claim", async () => {
    // Seed two due jobs.
    const { video: v1 } = await makeUserAndVideo("j1");
    const { video: v2 } = await makeUserAndVideo("j2");
    await enqueuePipelineJob(v1.id);
    await enqueuePipelineJob(v2.id);

    // Issue two concurrent claims; verify they don't overlap.
    const [a, b] = await Promise.all([
      claimDueJobs(1, randomUUID()),
      claimDueJobs(1, randomUUID()),
    ]);
    const ids = new Set<string>([...a, ...b].map((j) => j.videoId));
    expect(ids.size).toBe(a.length + b.length);
    expect(a.length + b.length).toBeGreaterThanOrEqual(1);
    // Each claim returns at most its own row.
    for (const j of [...a, ...b]) {
      expect(j.leasedAt).not.toBeNull();
    }
  });
});
