import { TrackSource, TrackType, type ParticipantInfo } from 'livekit-server-sdk';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PasswordService } from '../../src/auth/password.service';
import { LiveKitService } from '../../src/classroom/livekit.service';
import { resetEnvCache } from '../../src/config/env';
import { EgressService } from '../../src/recording/egress.service';
import { createTestContext, type TestContext } from './helpers/test-app';
import { FakeEgressService, FakeLiveKitService, makeEgressUnavailable } from './helpers/recording-fakes';
import { nowSeconds, postSignedWebhook, webhookPayload } from './helpers/webhook-signing';

const ROOM = 'classroom-main';
const PASSWORD = 'a perfectly fine password';

let ctx: TestContext;
let fakeLiveKit: FakeLiveKitService;
let fakeEgress: FakeEgressService;
const passwords = new PasswordService();

function participant(identity: string, tracks: Array<{ sid: string; type: TrackType; source: TrackSource }>) {
  return { identity, tracks } as unknown as ParticipantInfo;
}

function audioTrack(sid: string) {
  return { sid, type: TrackType.AUDIO, source: TrackSource.MICROPHONE };
}

async function seedUser(email: string, displayName: string) {
  return ctx.prisma.user.create({
    data: { email, displayName, passwordHash: await passwords.hash(PASSWORD) },
  });
}

async function openLesson(openedBy: string, maxParticipants = 2) {
  return ctx.prisma.lesson.create({ data: { room: ROOM, openedBy, maxParticipants } });
}

async function joinAndStartLesson(aliceId: string, bobId: string) {
  const firstBody = webhookPayload({
    event: 'participant_joined',
    room: { name: ROOM },
    participant: { identity: aliceId },
    createdAt: String(nowSeconds()),
  });
  await postSignedWebhook(ctx.app, firstBody);

  const secondBody = webhookPayload({
    event: 'participant_joined',
    room: { name: ROOM },
    participant: { identity: bobId },
    createdAt: String(nowSeconds()),
  });
  return postSignedWebhook(ctx.app, secondBody);
}

function trackPublished(identity: string, trackSid: string, type: TrackType = TrackType.AUDIO, source: TrackSource = TrackSource.MICROPHONE) {
  return webhookPayload({
    event: 'track_published',
    room: { name: ROOM },
    participant: { identity },
    track: { sid: trackSid, type, source },
    createdAt: String(nowSeconds()),
  });
}

function egressUpdated(egressId: string, status: number, fileStartedAtNanos = 0) {
  return webhookPayload({
    event: 'egress_updated',
    createdAt: String(nowSeconds()),
    egressInfo: {
      egressId,
      status,
      fileResults: [{ startedAt: String(fileStartedAtNanos), endedAt: '0', size: '0', duration: '0' }],
    },
  });
}

function egressEnded(egressId: string, status: number, error = '') {
  return webhookPayload({
    event: 'egress_ended',
    createdAt: String(nowSeconds()),
    egressInfo: {
      egressId,
      status,
      error,
      fileResults: [{ startedAt: '0', endedAt: String(nowSeconds() * 1_000_000_000), size: '0', duration: '0' }],
    },
  });
}

// LiveKit's EgressStatus enum values, per @livekit/protocol.
const EGRESS_ACTIVE = 1;
const EGRESS_COMPLETE = 3;
const EGRESS_FAILED = 4;

beforeAll(async () => {
  // `LiveKitService`'s constructor validates the environment eagerly, so a
  // minimal valid config has to exist before it can be instantiated at all —
  // `createTestContext` sets up the real one, but only once it runs, and the
  // fakes have to already exist to be passed as its overrides.
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db?schema=public',
    REDIS_URL: 'redis://localhost:6379',
    SESSION_SECRET: 'a'.repeat(48),
    BYOK_MASTER_KEY: Buffer.alloc(32, 7).toString('base64'),
    S3_ENDPOINT: 'http://localhost:9000',
    S3_ACCESS_KEY: 'minioadmin',
    S3_SECRET_KEY: 'minioadmin',
    S3_BUCKET: 'english-quest-test',
    LIVEKIT_URL: 'http://localhost:7880',
    LIVEKIT_WS_URL: 'ws://localhost:7880',
    LIVEKIT_API_KEY: 'devkey',
    LIVEKIT_API_SECRET: 'devsecret',
  });
  resetEnvCache();

  fakeLiveKit = new FakeLiveKitService();
  fakeEgress = new FakeEgressService();
  ctx = await createTestContext({
    overrides: [
      { token: LiveKitService, useValue: fakeLiveKit },
      { token: EgressService, useValue: fakeEgress },
    ],
  });
}, 180_000);

afterAll(async () => {
  await ctx?.close();
});

beforeEach(() => {
  fakeLiveKit.participantsToReturn = [];
  fakeLiveKit.listParticipantsError = null;
  fakeEgress.egressesStillTracked = [];
  fakeEgress.startCalls.length = 0;
  fakeEgress.stopCalls.length = 0;
});

afterEach(async () => {
  await ctx.prisma.lessonRecordingSegment.deleteMany();
  await ctx.prisma.lessonParticipant.deleteMany();
  await ctx.prisma.lesson.deleteMany();
  await ctx.prisma.user.deleteMany();
});

describe('recording egress', () => {
  it('starting_a_lesson_starts_one_egress_per_published_microphone', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const bob = await seedUser('bob@example.com', 'Bob');
    await openLesson(alice.id);
    fakeLiveKit.participantsToReturn = [
      participant(alice.id, [audioTrack('TR_alice_audio')]),
      participant(bob.id, [audioTrack('TR_bob_audio')]),
    ];

    await joinAndStartLesson(alice.id, bob.id);

    expect(fakeEgress.startCalls).toHaveLength(2);
    expect(fakeEgress.startCalls.map((call) => call.trackId).sort()).toEqual(
      ['TR_alice_audio', 'TR_bob_audio'].sort(),
    );
    for (const call of fakeEgress.startCalls) {
      expect(call.objectKey).toMatch(/^lessons\/.+\/.+\/segments\/.+\.ogg$/);
    }

    const lesson = await ctx.prisma.lesson.findFirstOrThrow({ where: { room: ROOM } });
    expect(lesson.recordingStatus).toBe('starting');
  });

  it('never_requests_egress_for_a_video_track', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const bob = await seedUser('bob@example.com', 'Bob');
    await openLesson(alice.id);
    await joinAndStartLesson(alice.id, bob.id);

    const body = trackPublished(alice.id, 'TR_alice_video', TrackType.VIDEO, TrackSource.CAMERA);
    await postSignedWebhook(ctx.app, body);

    expect(fakeEgress.startCalls).toHaveLength(0);
    const segments = await ctx.prisma.lessonRecordingSegment.findMany();
    expect(segments).toHaveLength(0);
  });

  it('does_not_record_before_the_lesson_starts', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    await openLesson(alice.id);
    const joinBody = webhookPayload({
      event: 'participant_joined',
      room: { name: ROOM },
      participant: { identity: alice.id },
      createdAt: String(nowSeconds()),
    });
    await postSignedWebhook(ctx.app, joinBody);

    const publishBody = trackPublished(alice.id, 'TR_alice_early');
    await postSignedWebhook(ctx.app, publishBody);

    expect(fakeEgress.startCalls).toHaveLength(0);
    const lesson = await ctx.prisma.lesson.findFirstOrThrow({ where: { room: ROOM } });
    expect(lesson.recordingStatus).toBe('idle');
  });

  it('a_late_join_starts_its_own_egress', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const bob = await seedUser('bob@example.com', 'Bob');
    const carol = await seedUser('carol@example.com', 'Carol');
    await openLesson(alice.id, 3);
    await joinAndStartLesson(alice.id, bob.id);
    fakeEgress.startCalls.length = 0;

    const body = trackPublished(carol.id, 'TR_carol_audio');
    const response = await postSignedWebhook(ctx.app, body);

    expect(response.status).toBe(200);
    expect(fakeEgress.startCalls).toEqual([
      expect.objectContaining({ trackId: 'TR_carol_audio' }),
    ]);
  });

  it('a_replayed_start_does_not_double_the_egress', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const bob = await seedUser('bob@example.com', 'Bob');
    await openLesson(alice.id);
    await joinAndStartLesson(alice.id, bob.id);

    const body = trackPublished(alice.id, 'TR_alice_dup');
    await postSignedWebhook(ctx.app, body);
    await postSignedWebhook(ctx.app, body);

    const segments = await ctx.prisma.lessonRecordingSegment.findMany({ where: { trackSid: 'TR_alice_dup' } });
    expect(segments).toHaveLength(1);
  });

  it('an_active_egress_moves_the_lesson_to_recording', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const bob = await seedUser('bob@example.com', 'Bob');
    await openLesson(alice.id);
    fakeEgress.queueStart({ egressId: 'EG_active_1' });
    await joinAndStartLesson(alice.id, bob.id);
    await postSignedWebhook(ctx.app, trackPublished(alice.id, 'TR_alice_active'));

    const segment = await ctx.prisma.lessonRecordingSegment.findFirstOrThrow({
      where: { trackSid: 'TR_alice_active' },
    });
    const fileStartedAtNanos = Date.now() * 1_000_000;
    await postSignedWebhook(ctx.app, egressUpdated(segment.egressId!, EGRESS_ACTIVE, fileStartedAtNanos));

    const lesson = await ctx.prisma.lesson.findFirstOrThrow({ where: { room: ROOM } });
    expect(lesson.recordingStatus).toBe('recording');
    expect(lesson.recordingStartedAt).not.toBeNull();
    const participantRow = await ctx.prisma.lessonParticipant.findFirstOrThrow({
      where: { lessonId: lesson.id, userId: alice.id },
    });
    expect(participantRow.recordingStatus).toBe('recording');
  });

  it('a_failed_start_is_retried_once_then_marks_not_recording', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const bob = await seedUser('bob@example.com', 'Bob');
    await openLesson(alice.id);
    fakeEgress.queueStart(makeEgressUnavailable(), makeEgressUnavailable());

    await joinAndStartLesson(alice.id, bob.id);
    await postSignedWebhook(ctx.app, trackPublished(alice.id, 'TR_alice_fails'));

    expect(fakeEgress.startCalls.filter((c) => c.trackId === 'TR_alice_fails')).toHaveLength(2);
    const segment = await ctx.prisma.lessonRecordingSegment.findFirstOrThrow({
      where: { trackSid: 'TR_alice_fails' },
    });
    expect(segment.status).toBe('failed');
    expect(segment.attempt).toBe(2);
    const lesson = await ctx.prisma.lesson.findFirstOrThrow({ where: { room: ROOM } });
    expect(lesson.recordingStatus).toBe('not_recording');
    const participantRow = await ctx.prisma.lessonParticipant.findFirstOrThrow({
      where: { lessonId: lesson.id, userId: alice.id },
    });
    expect(participantRow.recordingStatus).toBe('failed_to_start');
  }, 15_000);

  it('a_single_start_failure_recovers_on_retry', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const bob = await seedUser('bob@example.com', 'Bob');
    await openLesson(alice.id);
    fakeEgress.queueStart(makeEgressUnavailable(), { egressId: 'EG_recovered' });

    await joinAndStartLesson(alice.id, bob.id);
    await postSignedWebhook(ctx.app, trackPublished(alice.id, 'TR_alice_recovers'));

    const segment = await ctx.prisma.lessonRecordingSegment.findFirstOrThrow({
      where: { trackSid: 'TR_alice_recovers' },
    });
    expect(segment.status).toBe('starting');
    expect(segment.attempt).toBe(2);
    const lesson = await ctx.prisma.lesson.findFirstOrThrow({ where: { room: ROOM } });
    expect(lesson.recordingStatus).not.toBe('not_recording');
  }, 15_000);

  it('not_recording_is_sticky_for_the_rest_of_the_lesson', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const bob = await seedUser('bob@example.com', 'Bob');
    await openLesson(alice.id, 3);
    fakeEgress.queueStart(makeEgressUnavailable(), makeEgressUnavailable());

    await joinAndStartLesson(alice.id, bob.id);
    await postSignedWebhook(ctx.app, trackPublished(alice.id, 'TR_alice_first_fail'));

    let lesson = await ctx.prisma.lesson.findFirstOrThrow({ where: { room: ROOM } });
    expect(lesson.recordingStatus).toBe('not_recording');

    fakeEgress.queueStart({ egressId: 'EG_bob_ok' });
    await postSignedWebhook(ctx.app, trackPublished(bob.id, 'TR_bob_ok'));
    const bobSegment = await ctx.prisma.lessonRecordingSegment.findFirstOrThrow({
      where: { trackSid: 'TR_bob_ok' },
    });
    await postSignedWebhook(ctx.app, egressUpdated(bobSegment.egressId!, EGRESS_ACTIVE, Date.now() * 1_000_000));

    lesson = await ctx.prisma.lesson.findFirstOrThrow({ where: { room: ROOM } });
    expect(lesson.recordingStatus).toBe('not_recording');
  }, 15_000);

  it('an_unexpected_end_restarts_once_and_marks_partial', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const bob = await seedUser('bob@example.com', 'Bob');
    await openLesson(alice.id);
    fakeEgress.queueStart({ egressId: 'EG_first' }, { egressId: 'EG_restarted' });

    await joinAndStartLesson(alice.id, bob.id);
    await postSignedWebhook(ctx.app, trackPublished(alice.id, 'TR_alice_unexpected'));

    await postSignedWebhook(ctx.app, egressEnded('EG_first', EGRESS_FAILED, 'connection lost'));

    const segments = await ctx.prisma.lessonRecordingSegment.findMany({
      where: { trackSid: 'TR_alice_unexpected' },
      orderBy: { createdAt: 'asc' },
    });
    expect(segments).toHaveLength(2);
    expect(segments[0]!.status).toBe('failed');
    expect(segments[0]!.unexpected).toBe(true);
    expect(segments[1]!.egressId).toBe('EG_restarted');

    const lesson = await ctx.prisma.lesson.findFirstOrThrow({ where: { room: ROOM } });
    expect(lesson.recordingStatus).not.toBe('not_recording');
  }, 15_000);

  it('a_normal_end_after_unpublish_is_not_unexpected', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const bob = await seedUser('bob@example.com', 'Bob');
    await openLesson(alice.id);
    fakeEgress.queueStart({ egressId: 'EG_clean' });

    await joinAndStartLesson(alice.id, bob.id);
    await postSignedWebhook(ctx.app, trackPublished(alice.id, 'TR_alice_clean'));
    // A clean end after genuinely recording for a while — not a track that
    // never got off the ground, which is a different (failed-to-start) case.
    await postSignedWebhook(ctx.app, egressUpdated('EG_clean', EGRESS_ACTIVE, Date.now() * 1_000_000));
    await postSignedWebhook(ctx.app, egressEnded('EG_clean', EGRESS_COMPLETE));

    const segment = await ctx.prisma.lessonRecordingSegment.findFirstOrThrow({
      where: { trackSid: 'TR_alice_clean' },
    });
    expect(segment.status).toBe('complete');
    expect(segment.unexpected).toBe(false);
    // No restart — exactly one segment for this track.
    const segments = await ctx.prisma.lessonRecordingSegment.findMany({ where: { trackSid: 'TR_alice_clean' } });
    expect(segments).toHaveLength(1);
    const participantRow = await ctx.prisma.lessonParticipant.findFirstOrThrow({
      where: { userId: alice.id },
    });
    expect(participantRow.recordingStatus).toBe('stopped');
  });

  it('an_egress_event_for_an_unknown_id_is_acknowledged', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const bob = await seedUser('bob@example.com', 'Bob');
    await openLesson(alice.id);
    await joinAndStartLesson(alice.id, bob.id);

    const response = await postSignedWebhook(ctx.app, egressEnded('EG_never_existed', EGRESS_COMPLETE));

    expect(response.status).toBe(200);
  });
});
