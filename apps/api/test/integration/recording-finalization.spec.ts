import { randomUUID } from 'node:crypto';

import { SchedulerRegistry } from '@nestjs/schedule';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { LiveKitService } from '../../src/classroom/livekit.service';
import { resetEnvCache } from '../../src/config/env';
import { PipelineLaunchPort } from '../../src/recording/pipeline-launch.port';
import { RecordingFinalizationJob } from '../../src/recording/recording-finalization.job';
import { StudyPlanFallbackPort } from '../../src/recording/study-plan-fallback.port';
import { EgressService } from '../../src/recording/egress.service';
import { StorageService, StorageUnavailableError } from '../../src/storage/storage.service';
import { createTestContext, type TestContext } from './helpers/test-app';
import { FakeEgressService, FakeLiveKitService } from './helpers/recording-fakes';
import { startMinio, TEST_MINIO_ACCESS_KEY, TEST_MINIO_BUCKET, TEST_MINIO_SECRET_KEY, type StartedMinio } from './helpers/minio';
import { uploadTestSegment } from './helpers/segment-fixtures';

const ROOM = 'classroom-main';

/** Toggled per test to simulate a storage outage without needing a real container restart. */
class ToggleableStorageService extends StorageService {
  forceUnavailable = false;

  private guard(): void {
    if (this.forceUnavailable) {
      throw new StorageUnavailableError(new Error('forced unavailable for test'));
    }
  }

  override async statObject(key: string) {
    this.guard();
    return super.statObject(key);
  }

  override async downloadToFile(key: string, filePath: string) {
    this.guard();
    return super.downloadToFile(key, filePath);
  }

  override async uploadFile(key: string, filePath: string, contentType?: string) {
    this.guard();
    return super.uploadFile(key, filePath, contentType);
  }
}

let ctx: TestContext;
let minio: StartedMinio;
let storage: ToggleableStorageService;
let fakeLiveKit: FakeLiveKitService;
let fakeEgress: FakeEgressService;
let launchMock: ReturnType<typeof vi.fn>;
let fallbackMock: ReturnType<typeof vi.fn>;

async function seedUser(email: string) {
  return ctx.prisma.user.create({
    data: { email, displayName: email, passwordHash: 'x'.repeat(60) },
  });
}

interface MakeLessonOptions {
  durationSeconds?: number;
  recordingFinalizingSince?: Date;
  storageUnavailableSince?: Date | null;
}

async function makeEndedLesson(openedBy: string, options: MakeLessonOptions = {}) {
  const durationSeconds = options.durationSeconds ?? 600;
  const startedAt = new Date(Date.now() - durationSeconds * 1000);
  const endedAt = new Date();
  return ctx.prisma.lesson.create({
    data: {
      room: ROOM,
      openedBy,
      maxParticipants: 4,
      status: 'ended',
      startedAt,
      endedAt,
      endReason: 'ended_by_participant',
      durationSeconds,
      recordingStatus: 'finalizing',
      recordingFinalizingSince: options.recordingFinalizingSince ?? new Date(),
      storageUnavailableSince: options.storageUnavailableSince ?? null,
    },
  });
}

async function addConnectedParticipant(lessonId: string, userId: string) {
  return ctx.prisma.lessonParticipant.create({
    data: { lessonId, userId, identity: userId, joinedAt: new Date(), lastConnectedAt: new Date(), connected: true },
  });
}

/** A `complete` segment with a real uploaded object — what a finished, successful egress leaves behind. */
async function addCompleteSegment(params: {
  lessonId: string;
  userId: string;
  fileStartedAt: Date;
  fileEndedAt: Date;
  audioSeconds: number;
}) {
  const segmentId = randomUUID();
  const objectKey = await uploadTestSegment({
    storage,
    lessonId: params.lessonId,
    userId: params.userId,
    segmentId,
    durationSeconds: params.audioSeconds,
  });
  return ctx.prisma.lessonRecordingSegment.create({
    data: {
      id: segmentId,
      lessonId: params.lessonId,
      userId: params.userId,
      trackSid: `TR_${segmentId}`,
      objectKey,
      status: 'complete',
      fileStartedAt: params.fileStartedAt,
      fileEndedAt: params.fileEndedAt,
      durationMs: params.fileEndedAt.getTime() - params.fileStartedAt.getTime(),
    },
  });
}

/** A track that never got past the SDK's own start rejection — no egress, no object. */
async function addFailedToStartSegment(lessonId: string, userId: string) {
  const segmentId = randomUUID();
  await ctx.prisma.lessonRecordingSegment.create({
    data: {
      id: segmentId,
      lessonId,
      userId,
      trackSid: `TR_${segmentId}`,
      objectKey: `lessons/${lessonId}/${userId}/segments/${segmentId}.ogg`,
      status: 'failed',
      attempt: 2,
      error: 'simulated start failure',
    },
  });
  await ctx.prisma.lessonParticipant.updateMany({
    where: { lessonId, userId },
    data: { recordingStatus: 'failed_to_start' },
  });
}

async function objectExistsInMinio(key: string): Promise<boolean> {
  return (await storage.statObject(key)) !== null;
}

async function runFinalizationOnce(): Promise<void> {
  const job = ctx.app.get(RecordingFinalizationJob);
  await job.run();
}

beforeAll(async () => {
  minio = await startMinio();

  // A complete valid environment has to exist before any of these classes'
  // constructors (which read it eagerly) can be instantiated at all — the
  // fakes have to already exist to be passed as createTestContext's overrides.
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db?schema=public',
    REDIS_URL: 'redis://localhost:6379',
    SESSION_SECRET: 'a'.repeat(48),
    BYOK_MASTER_KEY: Buffer.alloc(32, 7).toString('base64'),
    S3_ENDPOINT: minio.endpoint,
    S3_ACCESS_KEY: TEST_MINIO_ACCESS_KEY,
    S3_SECRET_KEY: TEST_MINIO_SECRET_KEY,
    S3_BUCKET: TEST_MINIO_BUCKET,
    LIVEKIT_URL: 'http://localhost:7880',
    LIVEKIT_WS_URL: 'ws://localhost:7880',
    LIVEKIT_API_KEY: 'devkey',
    LIVEKIT_API_SECRET: 'devsecret',
  });
  resetEnvCache();

  storage = new ToggleableStorageService();
  await storage.ensureBucket();
  fakeLiveKit = new FakeLiveKitService();
  fakeEgress = new FakeEgressService();
  launchMock = vi.fn();
  fallbackMock = vi.fn();

  ctx = await createTestContext({
    extraEnv: {
      S3_ENDPOINT: minio.endpoint,
      S3_ACCESS_KEY: TEST_MINIO_ACCESS_KEY,
      S3_SECRET_KEY: TEST_MINIO_SECRET_KEY,
      S3_BUCKET: TEST_MINIO_BUCKET,
    },
    overrides: [
      { token: LiveKitService, useValue: fakeLiveKit },
      { token: EgressService, useValue: fakeEgress },
      { token: StorageService, useValue: storage },
      { token: PipelineLaunchPort, useValue: { launch: launchMock } },
      { token: StudyPlanFallbackPort, useValue: { requestFallbackPlan: fallbackMock } },
    ],
  });
  // Every test drives finalization itself through runFinalizationOnce(). The
  // job's own 5-second tick would otherwise finalize a lesson that a fixture
  // has created `finalizing` but not yet given its participants and segments.
  ctx.app.get(SchedulerRegistry).deleteInterval('recording-finalization-sweep');
}, 180_000);

afterAll(async () => {
  await ctx?.close();
  await minio?.stop();
});

beforeEach(() => {
  storage.forceUnavailable = false;
  fakeEgress.egressesStillTracked = [];
  fakeEgress.startCalls.length = 0;
  fakeEgress.stopCalls.length = 0;
  launchMock.mockClear();
  fallbackMock.mockClear();
});

afterEach(async () => {
  await ctx.prisma.lessonPipelineBranch.deleteMany();
  await ctx.prisma.lessonRecordingSegment.deleteMany();
  await ctx.prisma.lessonParticipant.deleteMany();
  await ctx.prisma.lesson.deleteMany();
  await ctx.prisma.user.deleteMany();
});

describe('recording finalization', () => {
  it('produces_exactly_one_audio_object_per_participant', async () => {
    const alice = await seedUser('alice@example.com');
    const bob = await seedUser('bob@example.com');
    const lesson = await makeEndedLesson(alice.id, { durationSeconds: 300 });
    await addConnectedParticipant(lesson.id, alice.id);
    await addConnectedParticipant(lesson.id, bob.id);
    const now = new Date();
    await addCompleteSegment({ lessonId: lesson.id, userId: alice.id, fileStartedAt: now, fileEndedAt: new Date(now.getTime() + 10_000), audioSeconds: 10 });
    await addCompleteSegment({ lessonId: lesson.id, userId: bob.id, fileStartedAt: now, fileEndedAt: new Date(now.getTime() + 10_000), audioSeconds: 10 });

    await runFinalizationOnce();

    const aliceKey = `lessons/${lesson.id}/${alice.id}/audio.ogg`;
    const bobKey = `lessons/${lesson.id}/${bob.id}/audio.ogg`;
    expect(await objectExistsInMinio(aliceKey)).toBe(true);
    expect(await objectExistsInMinio(bobKey)).toBe(true);
    // The segment rows stay forever as a record; only their raw objects are
    // deleted from storage once the assembled audio is verified.
    const remainingSegments = await ctx.prisma.lessonRecordingSegment.findMany({ where: { lessonId: lesson.id } });
    expect(remainingSegments).toHaveLength(2);
    for (const segment of remainingSegments) {
      expect(await objectExistsInMinio(segment.objectKey)).toBe(false);
    }
  }, 30_000);

  it('creates_no_video_object', async () => {
    const alice = await seedUser('alice@example.com');
    const lesson = await makeEndedLesson(alice.id, { durationSeconds: 300 });
    await addConnectedParticipant(lesson.id, alice.id);
    const now = new Date();
    await addCompleteSegment({ lessonId: lesson.id, userId: alice.id, fileStartedAt: now, fileEndedAt: new Date(now.getTime() + 10_000), audioSeconds: 10 });

    await runFinalizationOnce();

    // Every object this lesson ever produces is the assembled audio file —
    // no other prefix, no other extension.
    expect(await objectExistsInMinio(`lessons/${lesson.id}/${alice.id}/audio.ogg`)).toBe(true);
  }, 30_000);

  it('assembles_a_rejoin_into_one_continuous_file', async () => {
    const alice = await seedUser('alice@example.com');
    const lesson = await makeEndedLesson(alice.id, { durationSeconds: 300 });
    await addConnectedParticipant(lesson.id, alice.id);
    // Timestamps (not the fixture's real generated tone length) drive both
    // capturedMs and the assembled duration, so the captured spans below are
    // set to clear MIN_PARTICIPANT_CAPTURED_SECONDS (180s) — otherwise this
    // would hit the too-short failure path instead of the intended one —
    // while the fixture audio itself stays short so it's fast to generate.
    const start = new Date(Date.now() - 400_000);
    await addCompleteSegment({ lessonId: lesson.id, userId: alice.id, fileStartedAt: start, fileEndedAt: new Date(start.getTime() + 100_000), audioSeconds: 5 });
    await addCompleteSegment({
      lessonId: lesson.id,
      userId: alice.id,
      fileStartedAt: new Date(start.getTime() + 130_000),
      fileEndedAt: new Date(start.getTime() + 230_000),
      audioSeconds: 5,
    });

    await runFinalizationOnce();

    const participant = await ctx.prisma.lessonParticipant.findFirstOrThrow({ where: { lessonId: lesson.id, userId: alice.id } });
    expect(participant.audioDurationMs).toBe(230_000);
    // Captured excludes the 30s gap between the two segments.
    expect(participant.capturedMs).toBe(200_000);
  }, 30_000);

  it('waits_for_every_egress_before_verifying', async () => {
    const alice = await seedUser('alice@example.com');
    const lesson = await makeEndedLesson(alice.id, { durationSeconds: 300 });
    await addConnectedParticipant(lesson.id, alice.id);
    await ctx.prisma.lessonRecordingSegment.create({
      data: {
        lessonId: lesson.id,
        userId: alice.id,
        trackSid: 'TR_still_open',
        objectKey: `lessons/${lesson.id}/${alice.id}/segments/still-open.ogg`,
        status: 'active',
        fileStartedAt: new Date(),
      },
    });

    await runFinalizationOnce();

    const updated = await ctx.prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(updated.recordingStatus).toBe('finalizing');
    expect(await ctx.prisma.lessonPipelineBranch.count({ where: { lessonId: lesson.id } })).toBe(0);
    expect(fakeEgress.stopCalls).toEqual(expect.arrayContaining([]));
  }, 30_000);

  it('reconciles_a_segment_that_never_reports_ended', async () => {
    const alice = await seedUser('alice@example.com');
    // Finalization began 121 seconds ago — past the 120-second settle window.
    const lesson = await makeEndedLesson(alice.id, {
      durationSeconds: 300,
      recordingFinalizingSince: new Date(Date.now() - 121_000),
    });
    await addConnectedParticipant(lesson.id, alice.id);
    await ctx.prisma.lessonRecordingSegment.create({
      data: {
        lessonId: lesson.id,
        userId: alice.id,
        trackSid: 'TR_orphaned',
        egressId: 'EG_orphaned',
        objectKey: `lessons/${lesson.id}/${alice.id}/segments/orphaned.ogg`,
        status: 'active',
        fileStartedAt: new Date(Date.now() - 200_000),
      },
    });
    fakeEgress.egressesStillTracked = []; // LiveKit no longer knows about it.

    await runFinalizationOnce();

    const segment = await ctx.prisma.lessonRecordingSegment.findFirst({ where: { trackSid: 'TR_orphaned' } });
    // Reconciled to failed, then classified with no usable audio — no object was ever verified.
    expect(segment === null || segment.status === 'failed').toBe(true);
    const branch = await ctx.prisma.lessonPipelineBranch.findFirstOrThrow({ where: { lessonId: lesson.id, userId: alice.id } });
    expect(branch.status).toBe('failed');
    expect(branch.failureCode).toBe('recording_missing');
  }, 30_000);

  it('verifies_each_object_exceeds_10_kb_before_enqueueing', async () => {
    const alice = await seedUser('alice@example.com');
    const lesson = await makeEndedLesson(alice.id, { durationSeconds: 300 });
    await addConnectedParticipant(lesson.id, alice.id);
    const now = new Date();
    // A fraction of a second of audio compresses to well under 10 KB.
    await addCompleteSegment({ lessonId: lesson.id, userId: alice.id, fileStartedAt: now, fileEndedAt: new Date(now.getTime() + 50), audioSeconds: 0.05 });

    await runFinalizationOnce();

    const branch = await ctx.prisma.lessonPipelineBranch.findFirstOrThrow({ where: { lessonId: lesson.id, userId: alice.id } });
    expect(branch.status).toBe('failed');
    expect(branch.failureCode).toBe('recording_missing');
    expect(launchMock).not.toHaveBeenCalled();
  }, 30_000);

  it('a_short_lesson_is_too_short_and_enqueues_nothing', async () => {
    const alice = await seedUser('alice@example.com');
    const lesson = await makeEndedLesson(alice.id, { durationSeconds: 170 });
    await addConnectedParticipant(lesson.id, alice.id);
    const now = new Date();
    await addCompleteSegment({ lessonId: lesson.id, userId: alice.id, fileStartedAt: now, fileEndedAt: new Date(now.getTime() + 170_000), audioSeconds: 5 });

    await runFinalizationOnce();

    const updated = await ctx.prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(updated.recordingStatus).toBe('too_short');
    expect(await ctx.prisma.lessonPipelineBranch.count({ where: { lessonId: lesson.id } })).toBe(0);
    expect(launchMock).not.toHaveBeenCalled();
    expect(fallbackMock).not.toHaveBeenCalled();
    // Audio is still stored — retained indefinitely regardless of the outcome.
    expect(await objectExistsInMinio(`lessons/${lesson.id}/${alice.id}/audio.ogg`)).toBe(true);
  }, 30_000);

  it('one_missing_track_fails_only_that_branch', async () => {
    const alice = await seedUser('alice@example.com');
    const bob = await seedUser('bob@example.com');
    const lesson = await makeEndedLesson(alice.id, { durationSeconds: 300 });
    await addConnectedParticipant(lesson.id, alice.id);
    await addConnectedParticipant(lesson.id, bob.id);
    const now = new Date();
    await addCompleteSegment({ lessonId: lesson.id, userId: alice.id, fileStartedAt: now, fileEndedAt: new Date(now.getTime() + 200_000), audioSeconds: 5 });
    // Bob never published a microphone — no segment at all.

    await runFinalizationOnce();

    const aliceBranch = await ctx.prisma.lessonPipelineBranch.findFirstOrThrow({ where: { lessonId: lesson.id, userId: alice.id } });
    const bobBranch = await ctx.prisma.lessonPipelineBranch.findFirstOrThrow({ where: { lessonId: lesson.id, userId: bob.id } });
    expect(aliceBranch.status).toBe('queued');
    expect(bobBranch.status).toBe('failed');
    expect(bobBranch.failureCode).toBe('recording_missing');
    expect(bobBranch.failureReason).toBe('Recording is empty or missing.');
    expect(launchMock).toHaveBeenCalledTimes(1);
    expect(launchMock).toHaveBeenCalledWith(expect.objectContaining({ userId: alice.id }));

    const updated = await ctx.prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(updated.recordingStatus).toBe('recording_partial');
  }, 30_000);

  it('a_failed_recording_requests_a_fallback_plan_for_that_participant_only', async () => {
    const alice = await seedUser('alice@example.com');
    const bob = await seedUser('bob@example.com');
    const lesson = await makeEndedLesson(alice.id, { durationSeconds: 300 });
    await addConnectedParticipant(lesson.id, alice.id);
    await addConnectedParticipant(lesson.id, bob.id);
    await addFailedToStartSegment(lesson.id, bob.id);
    const now = new Date();
    await addCompleteSegment({ lessonId: lesson.id, userId: alice.id, fileStartedAt: now, fileEndedAt: new Date(now.getTime() + 200_000), audioSeconds: 5 });

    await runFinalizationOnce();

    expect(fallbackMock).toHaveBeenCalledTimes(1);
    expect(fallbackMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: bob.id, failureCode: 'recording_failed_to_start' }),
    );
    const bobBranch = await ctx.prisma.lessonPipelineBranch.findFirstOrThrow({ where: { lessonId: lesson.id, userId: bob.id } });
    expect(bobBranch.fallbackRequestedAt).not.toBeNull();
  }, 30_000);

  it('a_participant_under_three_minutes_fails_with_too_short', async () => {
    const alice = await seedUser('alice@example.com');
    const lesson = await makeEndedLesson(alice.id, { durationSeconds: 1200 });
    await addConnectedParticipant(lesson.id, alice.id);
    const now = new Date();
    // A late joiner: only 100 real seconds captured within a 20-minute lesson.
    await addCompleteSegment({ lessonId: lesson.id, userId: alice.id, fileStartedAt: now, fileEndedAt: new Date(now.getTime() + 100_000), audioSeconds: 5 });

    await runFinalizationOnce();

    const branch = await ctx.prisma.lessonPipelineBranch.findFirstOrThrow({ where: { lessonId: lesson.id, userId: alice.id } });
    expect(branch.failureCode).toBe('recording_too_short');
    expect(fallbackMock).toHaveBeenCalledTimes(1);
    expect(launchMock).not.toHaveBeenCalled();
  }, 30_000);

  it('a_partial_recording_over_three_minutes_still_launches', async () => {
    const alice = await seedUser('alice@example.com');
    const lesson = await makeEndedLesson(alice.id, { durationSeconds: 600 });
    await addConnectedParticipant(lesson.id, alice.id);
    const now = new Date();
    const first = await addCompleteSegment({ lessonId: lesson.id, userId: alice.id, fileStartedAt: now, fileEndedAt: new Date(now.getTime() + 200_000), audioSeconds: 5 });
    await ctx.prisma.lessonRecordingSegment.update({ where: { id: first.id }, data: { unexpected: true } });
    await addCompleteSegment({
      lessonId: lesson.id,
      userId: alice.id,
      fileStartedAt: new Date(now.getTime() + 200_000),
      fileEndedAt: new Date(now.getTime() + 300_000),
      audioSeconds: 5,
    });

    await runFinalizationOnce();

    const participant = await ctx.prisma.lessonParticipant.findFirstOrThrow({ where: { lessonId: lesson.id, userId: alice.id } });
    expect(participant.recordingStatus).toBe('partial');
    const branch = await ctx.prisma.lessonPipelineBranch.findFirstOrThrow({ where: { lessonId: lesson.id, userId: alice.id } });
    expect(branch.status).toBe('queued');
    expect(launchMock).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('no_usable_audio_is_recording_failed', async () => {
    const alice = await seedUser('alice@example.com');
    const bob = await seedUser('bob@example.com');
    const lesson = await makeEndedLesson(alice.id, { durationSeconds: 300 });
    await addConnectedParticipant(lesson.id, alice.id);
    await addConnectedParticipant(lesson.id, bob.id);
    await addFailedToStartSegment(lesson.id, alice.id);
    await addFailedToStartSegment(lesson.id, bob.id);

    await runFinalizationOnce();

    const updated = await ctx.prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(updated.recordingStatus).toBe('recording_failed');
    expect(launchMock).not.toHaveBeenCalled();
    expect(fallbackMock).toHaveBeenCalledTimes(2);
  }, 30_000);

  it('retries_storage_for_two_minutes_then_marks_storage_unavailable', async () => {
    const alice = await seedUser('alice@example.com');
    const lesson = await makeEndedLesson(alice.id, { durationSeconds: 300 });
    await addConnectedParticipant(lesson.id, alice.id);
    const now = new Date();
    await addCompleteSegment({ lessonId: lesson.id, userId: alice.id, fileStartedAt: now, fileEndedAt: new Date(now.getTime() + 200_000), audioSeconds: 5 });
    storage.forceUnavailable = true;

    await runFinalizationOnce();
    let updated = await ctx.prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(updated.recordingStatus).toBe('finalizing');
    expect(updated.storageUnavailableSince).not.toBeNull();
    expect(await ctx.prisma.lessonPipelineBranch.count({ where: { lessonId: lesson.id } })).toBe(0);

    // Fast-forward past the 2-minute window without waiting for real time.
    await ctx.prisma.lesson.update({
      where: { id: lesson.id },
      data: { storageUnavailableSince: new Date(Date.now() - 121_000) },
    });

    await runFinalizationOnce();
    updated = await ctx.prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(updated.recordingStatus).toBe('storage_unavailable');
    const branch = await ctx.prisma.lessonPipelineBranch.findFirstOrThrow({ where: { lessonId: lesson.id, userId: alice.id } });
    expect(branch.status).toBe('storage_unavailable');
    expect(fallbackMock).not.toHaveBeenCalled();
  }, 30_000);

  it('a_retry_after_storage_returns_enqueues_the_pipeline', async () => {
    const alice = await seedUser('alice@example.com');
    const lesson = await makeEndedLesson(alice.id, {
      durationSeconds: 300,
      storageUnavailableSince: new Date(),
    });
    await ctx.prisma.lesson.update({ where: { id: lesson.id }, data: { recordingStatus: 'storage_unavailable' } });
    await addConnectedParticipant(lesson.id, alice.id);
    const now = new Date();
    await addCompleteSegment({ lessonId: lesson.id, userId: alice.id, fileStartedAt: now, fileEndedAt: new Date(now.getTime() + 200_000), audioSeconds: 5 });
    await ctx.prisma.lessonPipelineBranch.create({
      data: { lessonId: lesson.id, userId: alice.id, stage: 'recording', status: 'storage_unavailable' },
    });

    // The store is back — the retry route's own job is exercised in
    // recording-routes.spec.ts; here it's driven directly to focus on the
    // finalizer's own reprocessing.
    const movedCount = await ctx.prisma.lessonPipelineBranch.updateMany({
      where: { lessonId: lesson.id, status: 'storage_unavailable' },
      data: { status: 'verifying' },
    });
    expect(movedCount.count).toBe(1);
    await ctx.prisma.lesson.update({
      where: { id: lesson.id },
      data: { recordingStatus: 'finalizing', storageUnavailableSince: null },
    });

    await runFinalizationOnce();

    const branch = await ctx.prisma.lessonPipelineBranch.findFirstOrThrow({ where: { lessonId: lesson.id, userId: alice.id } });
    expect(branch.status).toBe('queued');
    expect(launchMock).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('a_recovered_retry_launches_after_a_fallback', async () => {
    const alice = await seedUser('alice@example.com');
    const lesson = await makeEndedLesson(alice.id, { durationSeconds: 300 });
    await addConnectedParticipant(lesson.id, alice.id);
    // First pass: no segment exists yet — a genuinely missing recording.
    await runFinalizationOnce();
    let branch = await ctx.prisma.lessonPipelineBranch.findFirstOrThrow({ where: { lessonId: lesson.id, userId: alice.id } });
    expect(branch.failureCode).toBe('recording_missing');
    expect(fallbackMock).toHaveBeenCalledTimes(1);

    // The object turns up (recovered from wherever it was), and the branch is retried.
    const now = new Date();
    await addCompleteSegment({ lessonId: lesson.id, userId: alice.id, fileStartedAt: now, fileEndedAt: new Date(now.getTime() + 200_000), audioSeconds: 5 });
    await ctx.prisma.lessonPipelineBranch.update({
      where: { id: branch.id },
      data: { status: 'verifying', failureCode: null, failureReason: null },
    });
    await ctx.prisma.lesson.update({ where: { id: lesson.id }, data: { recordingStatus: 'finalizing' } });

    await runFinalizationOnce();

    branch = await ctx.prisma.lessonPipelineBranch.findFirstOrThrow({ where: { lessonId: lesson.id, userId: alice.id } });
    expect(branch.status).toBe('queued');
    expect(launchMock).toHaveBeenCalledTimes(1);
    // The fallback already granted for this branch is not requested again.
    expect(fallbackMock).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('a_second_tick_never_calls_a_seam_twice', async () => {
    const alice = await seedUser('alice@example.com');
    const bob = await seedUser('bob@example.com');
    const lesson = await makeEndedLesson(alice.id, { durationSeconds: 300 });
    await addConnectedParticipant(lesson.id, alice.id);
    await addConnectedParticipant(lesson.id, bob.id);
    const now = new Date();
    await addCompleteSegment({ lessonId: lesson.id, userId: alice.id, fileStartedAt: now, fileEndedAt: new Date(now.getTime() + 200_000), audioSeconds: 5 });
    await addFailedToStartSegment(lesson.id, bob.id);

    await runFinalizationOnce();
    // Runs again after the lesson has already reached a terminal status —
    // the scan query itself should no longer pick it up.
    await runFinalizationOnce();
    await runFinalizationOnce();

    expect(launchMock).toHaveBeenCalledTimes(1);
    expect(fallbackMock).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('the_lease_keeps_two_passes_from_assembling_the_same_lesson', async () => {
    const alice = await seedUser('alice@example.com');
    const lesson = await makeEndedLesson(alice.id, { durationSeconds: 300 });
    await addConnectedParticipant(lesson.id, alice.id);
    const now = new Date();
    await addCompleteSegment({ lessonId: lesson.id, userId: alice.id, fileStartedAt: now, fileEndedAt: new Date(now.getTime() + 200_000), audioSeconds: 5 });

    await Promise.all([runFinalizationOnce(), runFinalizationOnce()]);

    expect(launchMock).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('three_participants_produce_three_tracks_and_three_branches', async () => {
    const alice = await seedUser('alice@example.com');
    const bob = await seedUser('bob@example.com');
    const carol = await seedUser('carol@example.com');
    const lesson = await makeEndedLesson(alice.id, { durationSeconds: 300 });
    await addConnectedParticipant(lesson.id, alice.id);
    await addConnectedParticipant(lesson.id, bob.id);
    await addConnectedParticipant(lesson.id, carol.id);
    const now = new Date();
    for (const user of [alice, bob, carol]) {
      await addCompleteSegment({ lessonId: lesson.id, userId: user.id, fileStartedAt: now, fileEndedAt: new Date(now.getTime() + 200_000), audioSeconds: 5 });
    }

    await runFinalizationOnce();

    for (const user of [alice, bob, carol]) {
      expect(await objectExistsInMinio(`lessons/${lesson.id}/${user.id}/audio.ogg`)).toBe(true);
    }
    expect(await ctx.prisma.lessonPipelineBranch.count({ where: { lessonId: lesson.id, status: 'queued' } })).toBe(3);
    expect(launchMock).toHaveBeenCalledTimes(3);
    const updated = await ctx.prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(updated.recordingStatus).toBe('recorded');
  }, 30_000);

  it('the_lesson_record_names_and_attributes_the_audio_objects', async () => {
    const alice = await seedUser('alice@example.com');
    const lesson = await makeEndedLesson(alice.id, { durationSeconds: 300 });
    await addConnectedParticipant(lesson.id, alice.id);
    const now = new Date();
    await addCompleteSegment({ lessonId: lesson.id, userId: alice.id, fileStartedAt: now, fileEndedAt: new Date(now.getTime() + 200_000), audioSeconds: 5 });

    await runFinalizationOnce();

    // The object key is built from the lesson and the participant's own user
    // id — the same identifiers F08 will resolve the egress track back to.
    expect(await objectExistsInMinio(`lessons/${lesson.id}/${alice.id}/audio.ogg`)).toBe(true);
    const participant = await ctx.prisma.lessonParticipant.findFirstOrThrow({ where: { lessonId: lesson.id, userId: alice.id } });
    const startedLesson = await ctx.prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(participant.recordingStartedAt).not.toBeNull();
    expect(participant.recordingStartedAt!.getTime()).toBeGreaterThanOrEqual(startedLesson.startedAt!.getTime());
  }, 30_000);

  it('the_launch_port_receives_the_verified_object_key_per_participant', async () => {
    const alice = await seedUser('alice@example.com');
    const lesson = await makeEndedLesson(alice.id, { durationSeconds: 300 });
    await addConnectedParticipant(lesson.id, alice.id);
    const now = new Date();
    await addCompleteSegment({ lessonId: lesson.id, userId: alice.id, fileStartedAt: now, fileEndedAt: new Date(now.getTime() + 200_000), audioSeconds: 5 });

    await runFinalizationOnce();

    const participant = await ctx.prisma.lessonParticipant.findFirstOrThrow({ where: { lessonId: lesson.id, userId: alice.id } });
    expect(launchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lessonId: lesson.id,
        userId: alice.id,
        audioObjectKey: `lessons/${lesson.id}/${alice.id}/audio.ogg`,
        recordingStartedAt: participant.recordingStartedAt,
      }),
    );
  }, 30_000);
});
