import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { prisma } from "@/app/_lib/db";
import { enqueuePipelineJob, resolveLeaseTimeoutMs } from "../queue";
import { createWorker } from "../worker";
import * as probe from "@/app/_lib/videos/probe";
import * as audio from "../audio";

let storageRoot: string;

async function makeUserAndVideo(suffix: string, duration: number = 42) {
  const user = await prisma.user.create({
    data: {
      email: `wk-${suffix}@example.com`,
      name: "Worker User",
      passwordHash: "$2a$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
  });
  const relativeDir = path.join(user.id, `v-${suffix}`);
  const sourceRel = path.join(relativeDir, "source.mp4");
  const absoluteDir = path.join(storageRoot, relativeDir);
  mkdirSync(absoluteDir, { recursive: true });
  writeFileSync(path.join(storageRoot, sourceRel), "not-a-real-video");
  // Audio file is what transcribe reads.
  writeFileSync(path.join(absoluteDir, "audio.ogg"), "fake-audio");

  const video = await prisma.video.create({
    data: {
      userId: user.id,
      title: "Test",
      originalFilename: "x.mp4",
      sizeBytes: BigInt(100),
      containerFormat: "mp4",
      storagePath: sourceRel,
      status: "validating",
      durationSeconds: duration,
    },
  });
  return { user, video };
}

beforeAll(() => {
  storageRoot = mkdtempSync(path.join(tmpdir(), "videomax-pipeline-"));
  process.env.VIDEO_STORAGE_ROOT = storageRoot;
  process.env.OPENAI_FAKE = "1";
});

afterAll(async () => {
  await prisma.$disconnect();
  delete process.env.OPENAI_FAKE;
  try {
    rmSync(storageRoot, { recursive: true, force: true });
  } catch {}
});

beforeEach(async () => {
  await prisma.videoEvent.deleteMany({});
  await prisma.summary.deleteMany({});
  await prisma.transcriptionSegment.deleteMany({});
  await prisma.transcription.deleteMany({});
  await prisma.videoJob.deleteMany({});
  await prisma.video.deleteMany({});
  await prisma.user.deleteMany({});
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function runUntilDone(
  worker: ReturnType<typeof createWorker>,
  maxTicks = 20,
): Promise<number> {
  let processed = 0;
  for (let i = 0; i < maxTicks; i++) {
    // Pretend all backoff delays have elapsed so a single test walks the full
    // retry/advance schedule without real waits.
    await prisma.videoJob.updateMany({
      where: {},
      data: { scheduledAt: new Date(Date.now() - 1000) },
    });
    const n = await worker.runOnce();
    processed += n;
    if (n === 0) break;
  }
  return processed;
}

describe("pipeline worker (integration)", () => {
  it("pipeline_drives_video_to_ready_with_fake_openai", async () => {
    vi.spyOn(probe, "probeDuration").mockResolvedValue(42);
    vi.spyOn(audio, "extractAudioTrack").mockResolvedValue({
      ok: true,
      stderr: "",
    });

    const { video } = await makeUserAndVideo("happy");
    await enqueuePipelineJob(video.id);

    const worker = createWorker({ concurrency: 1, pollIntervalMs: 1000 });
    await runUntilDone(worker);

    const after = await prisma.video.findUniqueOrThrow({ where: { id: video.id } });
    expect(after.status).toBe("ready");

    const job = await prisma.videoJob.findUnique({ where: { videoId: video.id } });
    expect(job).toBeNull();

    const transcription = await prisma.transcription.findUnique({
      where: { videoId: video.id },
      include: { segments: true },
    });
    expect(transcription).not.toBeNull();
    expect(transcription!.detectedLanguage).toBe("en");
    expect(transcription!.segments.length).toBeGreaterThan(0);

    const summary = await prisma.summary.findUnique({ where: { videoId: video.id } });
    expect(summary).not.toBeNull();
    expect(summary!.overview.length).toBeGreaterThan(0);
    const topics = summary!.keyTopics as unknown as string[];
    expect(Array.isArray(topics)).toBe(true);
    expect(topics.length).toBeGreaterThan(0);

    const events = await prisma.videoEvent.findMany({
      where: { videoId: video.id },
      orderBy: { createdAt: "asc" },
    });
    const chain = events.map((e) => e.toStatus);
    expect(chain).toEqual(["transcribing", "summarizing", "ready"]);
  });

  it("pipeline_validate_rejects_file_longer_than_two_hours", async () => {
    vi.spyOn(probe, "probeDuration").mockResolvedValue(7300);
    vi.spyOn(audio, "extractAudioTrack").mockResolvedValue({
      ok: true,
      stderr: "",
    });

    const { video } = await makeUserAndVideo("too-long", 7300);
    await enqueuePipelineJob(video.id);

    const worker = createWorker({ concurrency: 1, pollIntervalMs: 1000 });
    await runUntilDone(worker);

    const after = await prisma.video.findUniqueOrThrow({ where: { id: video.id } });
    expect(after.status).toBe("failed");
    const job = await prisma.videoJob.findUniqueOrThrow({ where: { videoId: video.id } });
    expect(job.lastErrorCode).toBe("PIPE_VALIDATE_TOO_LONG");
    expect(job.failedAt).not.toBeNull();
  });

  it("pipeline_marks_failed_after_three_attempts", async () => {
    vi.spyOn(probe, "probeDuration").mockResolvedValue(42);
    vi.spyOn(audio, "extractAudioTrack").mockResolvedValue({
      ok: true,
      stderr: "",
    });
    const openai = await import("../openai");
    const spy = vi.spyOn(openai, "transcribeAudio").mockImplementation(async () => {
      const { PipelineError } = await import("../errors");
      throw new PipelineError("PIPE_TRANSCRIBE_API", "simulated 429", true);
    });

    const { video } = await makeUserAndVideo("retries");
    await enqueuePipelineJob(video.id);

    const worker = createWorker({ concurrency: 1, pollIntervalMs: 1000 });
    await runUntilDone(worker);

    expect(spy).toHaveBeenCalledTimes(3);
    const after = await prisma.video.findUniqueOrThrow({ where: { id: video.id } });
    expect(after.status).toBe("failed");
    const job = await prisma.videoJob.findUniqueOrThrow({ where: { videoId: video.id } });
    expect(job.lastErrorCode).toBe("PIPE_TRANSCRIBE_API");
  });

  it("pipeline_retries_transient_transcribe_failure_and_succeeds_on_next_attempt", async () => {
    vi.spyOn(probe, "probeDuration").mockResolvedValue(42);
    vi.spyOn(audio, "extractAudioTrack").mockResolvedValue({
      ok: true,
      stderr: "",
    });
    const openai = await import("../openai");
    let call = 0;
    vi.spyOn(openai, "transcribeAudio").mockImplementation(async () => {
      call++;
      if (call === 1) {
        const { PipelineError } = await import("../errors");
        throw new PipelineError("PIPE_TRANSCRIBE_API", "transient 429", true);
      }
      return {
        language: "en",
        segments: [{ index: 0, start: 0, end: 1, text: "Retry succeeded." }],
      };
    });

    const { video } = await makeUserAndVideo("retry-once");
    await enqueuePipelineJob(video.id);

    const worker = createWorker({ concurrency: 1, pollIntervalMs: 1000 });
    await runUntilDone(worker);

    const after = await prisma.video.findUniqueOrThrow({ where: { id: video.id } });
    expect(after.status).toBe("ready");
  });

  it("pipeline_worker_crash_simulation_re_enters_stage_after_lease_expiry", async () => {
    vi.spyOn(probe, "probeDuration").mockResolvedValue(42);
    vi.spyOn(audio, "extractAudioTrack").mockResolvedValue({
      ok: true,
      stderr: "",
    });

    const { video } = await makeUserAndVideo("crash");
    await enqueuePipelineJob(video.id);

    // Simulate a prior worker that claimed the job but never released the lease.
    await prisma.videoJob.update({
      where: { videoId: video.id },
      data: {
        leasedAt: new Date(Date.now() - 30 * 60_000),
        leaseId: "stale",
      },
    });

    const worker = createWorker({
      concurrency: 1,
      pollIntervalMs: 1000,
      leaseTimeoutMs: resolveLeaseTimeoutMs(),
    });
    await runUntilDone(worker);

    const after = await prisma.video.findUniqueOrThrow({ where: { id: video.id } });
    expect(after.status).toBe("ready");
  });
});
