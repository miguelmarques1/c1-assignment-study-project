import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PasswordService } from '../../src/auth/password.service';
import { RecordingFinalizationJob } from '../../src/recording/recording-finalization.job';
import { createTestContext, type TestContext } from './helpers/test-app';

const ROOM = 'classroom-main';
const PASSWORD = 'a perfectly fine password';

let ctx: TestContext;
const passwords = new PasswordService();

async function seedUser(email: string, displayName: string): Promise<{ id: string; cookie: string }> {
  const user = await ctx.prisma.user.create({
    data: { email, displayName, passwordHash: await passwords.hash(PASSWORD) },
  });
  const response = await request(ctx.app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: PASSWORD });
  const cookie = (response.headers['set-cookie'] as unknown as string[])[0]!;
  return { id: user.id, cookie };
}

function getRecording(lessonId: string, cookie: string) {
  return request(ctx.app.getHttpServer()).get(`/lessons/${lessonId}/recording`).set('Cookie', cookie);
}

function retryRecording(lessonId: string, cookie: string) {
  return request(ctx.app.getHttpServer())
    .post(`/lessons/${lessonId}/recording/retry`)
    .set('Cookie', cookie);
}

function getSession(cookie: string) {
  return request(ctx.app.getHttpServer()).get('/classroom/session').set('Cookie', cookie);
}

interface LessonSetup {
  recordingStatus?: string;
  lessonStatus?: string;
  endReason?: string | null;
  durationSeconds?: number | null;
}

const TERMINAL_LESSON_STATUSES = new Set(['ended', 'ended_unexpectedly', 'abandoned']);

async function makeLesson(openedBy: string, setup: LessonSetup = {}) {
  const status = setup.lessonStatus ?? 'ended';
  const isTerminal = TERMINAL_LESSON_STATUSES.has(status);
  return ctx.prisma.lesson.create({
    data: {
      room: ROOM,
      openedBy,
      maxParticipants: 2,
      status,
      startedAt: new Date(Date.now() - 600_000),
      endedAt: isTerminal ? new Date() : null,
      endReason: !isTerminal ? null : setup.endReason === undefined ? 'ended_by_participant' : setup.endReason,
      durationSeconds: setup.durationSeconds === undefined ? 600 : setup.durationSeconds,
      recordingStatus: setup.recordingStatus ?? 'recorded',
    },
  });
}

async function addParticipant(lessonId: string, userId: string, overrides: Record<string, unknown> = {}) {
  return ctx.prisma.lessonParticipant.create({
    data: {
      lessonId,
      userId,
      identity: userId,
      joinedAt: new Date(),
      lastConnectedAt: new Date(),
      connected: true,
      ...overrides,
    },
  });
}

beforeAll(async () => {
  ctx = await createTestContext({
    // The finalization job ticks every 5 seconds against real state — these
    // tests hand-craft lessons in specific recording states to exercise the
    // routes, and a real background pass would race to reclassify them
    // before an assertion runs. Overriding with a plain object (no
    // `@Interval` metadata on it) means Nest's scheduler never registers a
    // tick for it at all.
    overrides: [{ token: RecordingFinalizationJob, useValue: { run: async () => undefined } }],
  });
}, 180_000);

afterAll(async () => {
  await ctx?.close();
});

beforeEach(async () => {
  await ctx.prisma.lessonPipelineBranch.deleteMany();
  await ctx.prisma.lessonRecordingSegment.deleteMany();
  await ctx.prisma.lessonParticipant.deleteMany();
  await ctx.prisma.lesson.deleteMany();
  await ctx.prisma.user.deleteMany();
});

describe('recording routes', () => {
  it('session_reports_the_live_recording_state', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const bob = await seedUser('bob@example.com', 'Bob');
    const lesson = await makeLesson(alice.id, { lessonStatus: 'live', recordingStatus: 'recording' });
    await addParticipant(lesson.id, alice.id, { recordingStatus: 'recording' });
    await addParticipant(lesson.id, bob.id, { recordingStatus: 'recording' });
    await ctx.prisma.lesson.update({ where: { id: lesson.id }, data: { startedAt: new Date(Date.now() - 60_000) } });
    await ctx.prisma.lessonRecordingSegment.create({
      data: {
        lessonId: lesson.id,
        userId: alice.id,
        trackSid: 'TR_alice',
        objectKey: `lessons/${lesson.id}/${alice.id}/segments/s1.ogg`,
        status: 'active',
        fileStartedAt: new Date(Date.now() - 30_000),
      },
    });

    const response = await getSession(alice.cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.recording.status).toBe('recording');
    expect(response.body.data.recording.mine.status).toBe('recording');
    expect(response.body.data.recording.mine.capturedSeconds).toBeGreaterThanOrEqual(29);
  });

  it('session_reports_not_recording_to_every_participant', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const bob = await seedUser('bob@example.com', 'Bob');
    const lesson = await makeLesson(alice.id, { lessonStatus: 'live', recordingStatus: 'not_recording' });
    await addParticipant(lesson.id, alice.id, { recordingStatus: 'failed_to_start' });
    await addParticipant(lesson.id, bob.id, { recordingStatus: 'recording' });

    const aliceView = await getSession(alice.cookie);
    const bobView = await getSession(bob.cookie);

    expect(aliceView.body.data.recording.status).toBe('not_recording');
    expect(bobView.body.data.recording.status).toBe('not_recording');
    expect(aliceView.body.data.recording.mine.status).toBe('failed_to_start');
    expect(bobView.body.data.recording.mine.status).toBe('recording');
  });

  it('the_view_carries_only_the_callers_own_recording', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const bob = await seedUser('bob@example.com', 'Bob');
    const lesson = await makeLesson(alice.id, { recordingStatus: 'recording_partial' });
    await addParticipant(lesson.id, alice.id, {
      recordingStatus: 'complete',
      audioObjectKey: `lessons/${lesson.id}/${alice.id}/audio.ogg`,
      audioBytes: 500_000n,
      capturedMs: 300_000,
      audioDurationMs: 300_000,
    });
    await addParticipant(lesson.id, bob.id, { recordingStatus: 'missing' });
    await ctx.prisma.lessonPipelineBranch.create({
      data: { lessonId: lesson.id, userId: alice.id, stage: 'recording', status: 'queued' },
    });
    await ctx.prisma.lessonPipelineBranch.create({
      data: {
        lessonId: lesson.id,
        userId: bob.id,
        stage: 'recording',
        status: 'failed',
        failureCode: 'recording_missing',
        failureReason: 'Recording is empty or missing.',
      },
    });

    const aliceView = await getRecording(lesson.id, alice.cookie);
    const bobView = await getRecording(lesson.id, bob.cookie);

    expect(aliceView.body.data.mine.recordingStatus).toBe('complete');
    expect(aliceView.body.data.mine.audioBytes).toBe(500_000);
    expect(aliceView.body.data.mine.branch.status).toBe('queued');
    expect(JSON.stringify(aliceView.body.data)).not.toContain('recording_missing');

    expect(bobView.body.data.mine.recordingStatus).toBe('missing');
    expect(bobView.body.data.mine.audioBytes).toBeNull();
    expect(bobView.body.data.mine.branch.failureCode).toBe('recording_missing');
    // Bob's view still reports the lesson-wide byte total (both participants'), but never Alice's own breakdown.
    expect(bobView.body.data.storageBytes).toBe(500_000);
  });

  it('the_view_exposes_the_end_reason', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const lesson = await makeLesson(alice.id, { endReason: 'max_duration' });
    await addParticipant(lesson.id, alice.id);

    const response = await getRecording(lesson.id, alice.cookie);

    expect(response.body.data.endReason).toBe('max_duration');
  });

  it('rejects_a_non_participant', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const carol = await seedUser('carol@example.com', 'Carol');
    const lesson = await makeLesson(alice.id);
    await addParticipant(lesson.id, alice.id);

    const getResponse = await getRecording(lesson.id, carol.cookie);
    const retryResponse = await retryRecording(lesson.id, carol.cookie);

    expect(getResponse.status).toBe(403);
    expect(getResponse.body.error.code).toBe('CLASS004');
    expect(retryResponse.status).toBe(403);
    expect(retryResponse.body.error.code).toBe('CLASS004');
  });

  it('retry_is_accepted_for_a_retryable_branch', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const lesson = await makeLesson(alice.id, { recordingStatus: 'recording_failed' });
    await addParticipant(lesson.id, alice.id, { recordingStatus: 'missing' });
    await ctx.prisma.lessonPipelineBranch.create({
      data: {
        lessonId: lesson.id,
        userId: alice.id,
        stage: 'recording',
        status: 'failed',
        failureCode: 'recording_missing',
        failureReason: 'Recording is empty or missing.',
        attempts: 1,
      },
    });

    const response = await retryRecording(lesson.id, alice.cookie);

    expect(response.status).toBe(202);
    expect(response.body.data.recordingStatus).toBe('finalizing');
    expect(response.body.data.mine.branch.status).toBe('verifying');

    const branch = await ctx.prisma.lessonPipelineBranch.findFirstOrThrow({
      where: { lessonId: lesson.id, userId: alice.id },
    });
    // `attempts` only increments when a finalization pass reclassifies the
    // branch (`upsertBranch`); the retry route itself only flips the status
    // back to `verifying` so the next pass runs at all.
    expect(branch.attempts).toBe(1);
    const updatedLesson = await ctx.prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(updatedLesson.recordingStatus).toBe('finalizing');
  });

  it('retry_is_rejected_when_nothing_is_retryable', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const lesson = await makeLesson(alice.id, { recordingStatus: 'too_short', durationSeconds: 100 });
    await addParticipant(lesson.id, alice.id);

    const response = await retryRecording(lesson.id, alice.cookie);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('REC001');
    expect(response.body.error.details).toEqual({ recordingStatus: 'too_short' });
  });

  it('retry_is_rejected_while_recording_or_finalizing', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const live = await makeLesson(alice.id, { lessonStatus: 'live', recordingStatus: 'recording' });
    await addParticipant(live.id, alice.id, { recordingStatus: 'recording' });

    const liveResponse = await retryRecording(live.id, alice.cookie);
    expect(liveResponse.status).toBe(409);
    expect(liveResponse.body.error.code).toBe('REC002');

    const finalizing = await makeLesson(alice.id, { recordingStatus: 'finalizing' });
    await addParticipant(finalizing.id, alice.id);
    const finalizingResponse = await retryRecording(finalizing.id, alice.cookie);
    expect(finalizingResponse.status).toBe(409);
    expect(finalizingResponse.body.error.code).toBe('REC002');
  });

  it('rejects_a_malformed_lesson_id', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');

    const getResponse = await getRecording('not-a-uuid', alice.cookie);
    const retryResponse = await retryRecording('not-a-uuid', alice.cookie);

    expect(getResponse.status).toBe(400);
    expect(getResponse.body.error.code).toBe('VAL001');
    expect(retryResponse.status).toBe(400);
    expect(retryResponse.body.error.code).toBe('VAL001');
  });

  it('requires_authentication', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const lesson = await makeLesson(alice.id);
    await addParticipant(lesson.id, alice.id);

    const getResponse = await request(ctx.app.getHttpServer()).get(`/lessons/${lesson.id}/recording`);
    const retryResponse = await request(ctx.app.getHttpServer()).post(`/lessons/${lesson.id}/recording/retry`);

    expect(getResponse.status).toBe(401);
    expect(retryResponse.status).toBe(401);
  });
});
