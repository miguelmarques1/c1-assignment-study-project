import { ERROR_CODES } from '@english-quest/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PasswordService } from '../../src/auth/password.service';
import { LessonService } from '../../src/classroom/lesson.service';
import { LiveKitService } from '../../src/classroom/livekit.service';
import { AppError } from '../../src/common/app-error';
import { resetEnvCache } from '../../src/config/env';
import { createTestContext, type TestContext } from './helpers/test-app';

const PASSWORD = 'a perfectly fine password';

let ctx: TestContext;
const passwords = new PasswordService();

/**
 * Stands in for LiveKit's live room state. Each test pushes an identity onto
 * `liveIdentities` right after a token request it wants treated as "now
 * connected" — the orchestration logic under test reads occupancy from here,
 * exactly like the real `LiveKitService` reads it from LiveKit's own
 * `listParticipants`.
 */
let liveIdentities: string[] = [];
const listParticipantsMock = vi.fn(async () => liveIdentities.map((identity) => ({ identity }) as never));
const createRoomMock = vi.fn().mockResolvedValue(undefined);
const deleteRoomMock = vi.fn().mockResolvedValue(undefined);
let tokenCounter = 0;
const issueAccessTokenMock = vi.fn(async () => ({
  token: `fake-token-${++tokenCounter}`,
  expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
}));

beforeAll(async () => {
  ctx = await createTestContext({
    overrides: [
      {
        token: LiveKitService,
        useValue: {
          listParticipants: listParticipantsMock,
          createRoom: createRoomMock,
          deleteRoom: deleteRoomMock,
          issueAccessToken: issueAccessTokenMock,
          verifyWebhook: vi.fn(),
        },
      },
    ],
  });
}, 180_000);

afterAll(async () => {
  await ctx?.close();
});

beforeEach(async () => {
  await ctx.prisma.lessonParticipant.deleteMany();
  await ctx.prisma.lesson.deleteMany();
  await ctx.prisma.user.deleteMany();

  liveIdentities = [];
  listParticipantsMock.mockClear();
  createRoomMock.mockClear();
  deleteRoomMock.mockClear();
  issueAccessTokenMock.mockClear();
});

afterEach(() => {
  process.env.LESSON_MAX_PARTICIPANTS = '2';
  resetEnvCache();
});

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

async function requestToken(cookie: string) {
  return request(ctx.app.getHttpServer()).post('/classroom/token').set('Cookie', cookie);
}

describe('classroom token issuance and session', () => {
  it('issues_a_token_and_opens_a_waiting_lesson', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');

    const response = await requestToken(alice.cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.maxParticipants).toBe(2);
    expect(response.body.data.status).toBe('waiting');
    expect(response.body.data.url).toBeTypeOf('string');
    expect(response.body.data.token).toBeTypeOf('string');
    expect(response.body.data.lessonId).toBeTypeOf('string');

    const lesson = await ctx.prisma.lesson.findFirstOrThrow();
    expect(lesson.status).toBe('waiting');
    expect(lesson.openedBy).toBe(alice.id);
    expect(lesson.startedAt).toBeNull();

    const participants = await ctx.prisma.lessonParticipant.findMany();
    expect(participants).toHaveLength(1);
    expect(participants[0]?.userId).toBe(alice.id);
  });

  it('reuses_the_open_lesson_for_a_second_participant', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const bob = await seedUser('bob@example.com', 'Bob');

    const first = await requestToken(alice.cookie);
    liveIdentities.push(alice.id);
    const second = await requestToken(bob.cookie);

    expect(second.body.data.lessonId).toBe(first.body.data.lessonId);
    expect(await ctx.prisma.lesson.count()).toBe(1);
    expect(await ctx.prisma.lessonParticipant.count()).toBe(2);
  });

  it('re_issuing_a_token_for_an_already_present_participant_does_not_count_against_the_cap', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const bob = await seedUser('bob@example.com', 'Bob');

    await requestToken(alice.cookie);
    liveIdentities.push(alice.id);
    await requestToken(bob.cookie);
    liveIdentities.push(bob.id);

    // The room is now at cap (2); Alice re-requesting her own token must not
    // be refused just because she is already counted in occupancy.
    const reissued = await requestToken(alice.cookie);

    expect(reissued.status).toBe(200);
    expect(await ctx.prisma.lessonParticipant.count()).toBe(2);
  });

  it('refuses_a_token_beyond_the_configured_cap', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const bob = await seedUser('bob@example.com', 'Bob');
    const carol = await seedUser('carol@example.com', 'Carol');

    await requestToken(alice.cookie);
    liveIdentities.push(alice.id);
    await requestToken(bob.cookie);
    liveIdentities.push(bob.id);

    const third = await requestToken(carol.cookie);

    expect(third.status).toBe(409);
    expect(third.body.error.code).toBe(ERROR_CODES.CLASSROOM_FULL);
    expect(third.body.error.details.maxParticipants).toBe(2);
    expect(await ctx.prisma.lessonParticipant.findFirst({ where: { userId: carol.id } })).toBeNull();
  });

  it('admits_a_third_participant_when_the_cap_is_raised_to_3', async () => {
    process.env.LESSON_MAX_PARTICIPANTS = '3';
    resetEnvCache();

    const alice = await seedUser('alice@example.com', 'Alice');
    const bob = await seedUser('bob@example.com', 'Bob');
    const carol = await seedUser('carol@example.com', 'Carol');

    await requestToken(alice.cookie);
    liveIdentities.push(alice.id);
    await requestToken(bob.cookie);
    liveIdentities.push(bob.id);
    const third = await requestToken(carol.cookie);

    expect(third.status).toBe(200);
    expect(await ctx.prisma.lessonParticipant.count()).toBe(3);
  });

  it('returns_503_when_livekit_is_unreachable', async () => {
    listParticipantsMock.mockImplementationOnce(async () => {
      throw AppError.classroomUnavailable('LiveKit server not reachable');
    });
    const alice = await seedUser('alice@example.com', 'Alice');

    const response = await requestToken(alice.cookie);

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe(ERROR_CODES.CLASSROOM_UNAVAILABLE);
    expect(response.body.error.details.reason).toBe('LiveKit server not reachable');
    expect(await ctx.prisma.lesson.count()).toBe(0);
  });

  it('calls_create_room_with_the_configured_cap', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');

    await requestToken(alice.cookie);

    expect(createRoomMock).toHaveBeenCalledWith('classroom-main', 2);
  });

  it('session_returns_null_when_nothing_is_open', async () => {
    await seedUser('alice@example.com', 'Alice');
    const { cookie } = await seedUser('bob@example.com', 'Bob');

    const response = await request(ctx.app.getHttpServer()).get('/classroom/session').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.data).toBeNull();
  });

  it('session_lists_participants_and_awaiting_accounts', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const bob = await seedUser('bob@example.com', 'Bob');

    const tokenResponse = await requestToken(alice.cookie);
    const lessonId = tokenResponse.body.data.lessonId as string;

    await ctx.app.get(LessonService).markConnected(lessonId, alice.id, alice.id, new Date());

    const response = await request(ctx.app.getHttpServer())
      .get('/classroom/session')
      .set('Cookie', alice.cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.lessonId).toBe(lessonId);
    const connected = response.body.data.participants.find((p: { userId: string }) => p.userId === alice.id);
    expect(connected).toMatchObject({ userId: alice.id, connected: true });
    expect(connected.joinedAt).toBeTypeOf('string');

    const awaiting = response.body.data.awaiting.map((entry: { userId: string }) => entry.userId);
    expect(awaiting).toContain(bob.id);
  });

  it('the_caller_never_awaits_themselves_before_they_have_connected', async () => {
    // Found via manual verification against a real LiveKit server: a seat is
    // claimed by registering for the lesson (token issuance), not only by
    // having actively connected — otherwise the caller who just requested
    // their own token shows up "awaiting" themselves until their first
    // participant_joined webhook arrives.
    const alice = await seedUser('alice@example.com', 'Alice');
    const bob = await seedUser('bob@example.com', 'Bob');

    await requestToken(alice.cookie);

    const response = await request(ctx.app.getHttpServer())
      .get('/classroom/session')
      .set('Cookie', alice.cookie);

    const awaiting = response.body.data.awaiting.map((entry: { userId: string }) => entry.userId);
    expect(awaiting).not.toContain(alice.id);
    expect(awaiting).toContain(bob.id);
  });
});

describe('classroom end lesson', () => {
  it('ends_a_lesson_on_request', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const tokenResponse = await requestToken(alice.cookie);
    const lessonId = tokenResponse.body.data.lessonId as string;
    // Simulates the lesson having actually started, so `duration_seconds`
    // has something real to compute — the second-simultaneous-join rule
    // that sets this in production is covered separately by the webhook suite.
    await ctx.app.get(LessonService).startLesson(lessonId, new Date(Date.now() - 5_000));

    const response = await request(ctx.app.getHttpServer())
      .post(`/classroom/${lessonId}/end`)
      .set('Cookie', alice.cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ended');
    expect(response.body.data.durationSeconds).toBeTypeOf('number');
    expect(response.body.data.durationSeconds).toBeGreaterThanOrEqual(0);

    const lesson = await ctx.prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } });
    expect(lesson.endReason).toBe('ended_by_participant');
    expect(lesson.endedBy).toBe(alice.id);
    expect(deleteRoomMock).toHaveBeenCalledWith('classroom-main');
  });

  it('rejects_end_from_a_non_participant', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const carol = await seedUser('carol@example.com', 'Carol');
    const tokenResponse = await requestToken(alice.cookie);
    const lessonId = tokenResponse.body.data.lessonId as string;

    const response = await request(ctx.app.getHttpServer())
      .post(`/classroom/${lessonId}/end`)
      .set('Cookie', carol.cookie);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(ERROR_CODES.LESSON_NOT_A_PARTICIPANT);
    const lesson = await ctx.prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } });
    expect(lesson.status).toBe('waiting');
  });

  it('rejects_end_on_an_already_terminal_lesson', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const tokenResponse = await requestToken(alice.cookie);
    const lessonId = tokenResponse.body.data.lessonId as string;

    await request(ctx.app.getHttpServer()).post(`/classroom/${lessonId}/end`).set('Cookie', alice.cookie);
    const second = await request(ctx.app.getHttpServer())
      .post(`/classroom/${lessonId}/end`)
      .set('Cookie', alice.cookie);

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe(ERROR_CODES.LESSON_NOT_ACTIVE);
  });

  it('rejects_a_malformed_lesson_id', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');

    const response = await request(ctx.app.getHttpServer())
      .post('/classroom/not-a-uuid/end')
      .set('Cookie', alice.cookie);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
  });

  it('requires_authentication_on_every_classroom_route', async () => {
    const token = await request(ctx.app.getHttpServer()).post('/classroom/token');
    const session = await request(ctx.app.getHttpServer()).get('/classroom/session');
    const end = await request(ctx.app.getHttpServer()).post(
      '/classroom/00000000-0000-0000-0000-000000000000/end',
    );

    expect(token.status).toBe(401);
    expect(session.status).toBe(401);
    expect(end.status).toBe(401);
  });
});

describe('cross-feature integration (PRD Section 9)', () => {
  it('the_open_session_is_the_one_f06_will_attach_its_scenario_to', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const bob = await seedUser('bob@example.com', 'Bob');

    const aliceToken = await requestToken(alice.cookie);
    liveIdentities.push(alice.id);
    const bobToken = await requestToken(bob.cookie);

    const lessonId = aliceToken.body.data.lessonId as string;
    expect(bobToken.body.data.lessonId).toBe(lessonId);

    const session = await request(ctx.app.getHttpServer())
      .get('/classroom/session')
      .set('Cookie', alice.cookie);

    expect(session.body.data.lessonId).toBe(lessonId);
    const identities = session.body.data.participants.map((p: { userId: string }) => p.userId).sort();
    expect(identities).toEqual([alice.id, bob.id].sort());
  });
});
