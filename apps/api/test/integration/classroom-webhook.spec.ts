import { createHash } from 'node:crypto';

import { AccessToken } from 'livekit-server-sdk';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PasswordService } from '../../src/auth/password.service';
import { createTestContext, type TestContext } from './helpers/test-app';

/** Matches test-app.ts's LIVEKIT_API_KEY/SECRET, so signatures verify for real. */
const API_KEY = 'devkey';
const API_SECRET = 'devsecret';
const ROOM = 'classroom-main';
const PASSWORD = 'a perfectly fine password';

let ctx: TestContext;
const passwords = new PasswordService();

/**
 * Replicates WebhookReceiver's own signing scheme: an AccessToken carrying
 * only `sha256` of the raw body. The result is the raw JWT itself — LiveKit's
 * webhook `Authorization` header carries no `Bearer ` scheme prefix, unlike
 * this API's own session bearer transport.
 */
async function sign(body: string, secret = API_SECRET): Promise<string> {
  const sha256 = createHash('sha256').update(body, 'utf8').digest('base64');
  const token = new AccessToken(API_KEY, secret);
  token.sha256 = sha256;
  return token.toJwt();
}

function payload(fields: Record<string, unknown>): string {
  return JSON.stringify({ id: 'evt-1', ...fields });
}

async function postWebhook(body: string, authHeader?: string) {
  const req = request(ctx.app.getHttpServer())
    .post('/classroom/livekit-webhook')
    .set('Content-Type', 'application/webhook+json');
  if (authHeader !== undefined) {
    req.set('Authorization', authHeader);
  }
  return req.send(body);
}

async function seedUser(email: string, displayName: string): Promise<{ id: string }> {
  return ctx.prisma.user.create({
    data: { email, displayName, passwordHash: await passwords.hash(PASSWORD) },
  });
}

async function openLesson(openedBy: string, maxParticipants = 2) {
  return ctx.prisma.lesson.create({ data: { room: ROOM, openedBy, maxParticipants } });
}

const eventTimeSeconds = () => Math.floor(Date.now() / 1000);

beforeAll(async () => {
  ctx = await createTestContext();
}, 180_000);

afterAll(async () => {
  await ctx?.close();
});

beforeEach(async () => {
  await ctx.prisma.lessonParticipant.deleteMany();
  await ctx.prisma.lesson.deleteMany();
  await ctx.prisma.user.deleteMany();
});

describe('classroom webhook', () => {
  it('rejects_an_unsigned_body', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const lesson = await openLesson(alice.id);
    const body = payload({
      event: 'participant_joined',
      room: { name: ROOM },
      participant: { identity: alice.id },
      createdAt: String(eventTimeSeconds()),
    });

    const response = await postWebhook(body);

    expect(response.status).toBe(401);
    const row = await ctx.prisma.lessonParticipant.findFirst({ where: { lessonId: lesson.id } });
    expect(row).toBeNull();
  });

  it('rejects_a_tampered_body', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const lesson = await openLesson(alice.id);
    const signedBody = payload({
      event: 'participant_joined',
      room: { name: ROOM },
      participant: { identity: alice.id },
      createdAt: String(eventTimeSeconds()),
    });
    const auth = await sign(signedBody);
    // Valid signature, but over a different (larger) payload than what is sent.
    const tamperedBody = payload({
      event: 'participant_joined',
      room: { name: ROOM },
      participant: { identity: 'someone-else' },
      createdAt: String(eventTimeSeconds()),
    });

    const response = await postWebhook(tamperedBody, `Bearer ${auth}`);

    expect(response.status).toBe(401);
    const row = await ctx.prisma.lessonParticipant.findFirst({ where: { lessonId: lesson.id } });
    expect(row).toBeNull();
  });

  it('participant_joined_marks_the_participant_connected', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    await openLesson(alice.id);
    const eventTime = eventTimeSeconds();
    const body = payload({
      event: 'participant_joined',
      room: { name: ROOM },
      participant: { identity: alice.id },
      createdAt: String(eventTime),
    });

    const response = await postWebhook(body, `${await sign(body)}`);

    expect(response.status).toBe(200);
    const row = await ctx.prisma.lessonParticipant.findFirstOrThrow({ where: { userId: alice.id } });
    expect(row.connected).toBe(true);
    expect(Math.floor(row.joinedAt.getTime() / 1000)).toBe(eventTime);
    expect(Math.floor(row.lastConnectedAt!.getTime() / 1000)).toBe(eventTime);
  });

  it('the_second_simultaneous_join_starts_the_lesson', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const bob = await seedUser('bob@example.com', 'Bob');
    const lesson = await openLesson(alice.id);

    const firstBody = payload({
      event: 'participant_joined',
      room: { name: ROOM },
      participant: { identity: alice.id },
      createdAt: String(eventTimeSeconds()),
    });
    await postWebhook(firstBody, `${await sign(firstBody)}`);

    const startEventTime = eventTimeSeconds();
    const secondBody = payload({
      event: 'participant_joined',
      room: { name: ROOM },
      participant: { identity: bob.id },
      createdAt: String(startEventTime),
    });
    const response = await postWebhook(secondBody, `${await sign(secondBody)}`);

    expect(response.status).toBe(200);
    const updated = await ctx.prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(updated.status).toBe('live');
    expect(Math.floor(updated.startedAt!.getTime() / 1000)).toBe(startEventTime);
  });

  it('a_late_join_does_not_move_started_at', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const bob = await seedUser('bob@example.com', 'Bob');
    const carol = await seedUser('carol@example.com', 'Carol');
    const lesson = await openLesson(alice.id, 3);

    for (const user of [alice, bob]) {
      const body = payload({
        event: 'participant_joined',
        room: { name: ROOM },
        participant: { identity: user.id },
        createdAt: String(eventTimeSeconds()),
      });
      await postWebhook(body, `${await sign(body)}`);
    }
    const startedAfterTwo = (await ctx.prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } }))
      .startedAt!;

    const lateEventTime = eventTimeSeconds() + 120;
    const lateBody = payload({
      event: 'participant_joined',
      room: { name: ROOM },
      participant: { identity: carol.id },
      createdAt: String(lateEventTime),
    });
    await postWebhook(lateBody, `${await sign(lateBody)}`);

    const finalLesson = await ctx.prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(finalLesson.startedAt!.getTime()).toBe(startedAfterTwo.getTime());

    const carolRow = await ctx.prisma.lessonParticipant.findFirstOrThrow({ where: { userId: carol.id } });
    expect(Math.floor(carolRow.joinedAt.getTime() / 1000)).toBe(lateEventTime);
  });

  it('a_rejoin_clears_all_disconnected_since', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const bob = await seedUser('bob@example.com', 'Bob');
    const lesson = await openLesson(alice.id);

    for (const user of [alice, bob]) {
      const body = payload({
        event: 'participant_joined',
        room: { name: ROOM },
        participant: { identity: user.id },
        createdAt: String(eventTimeSeconds()),
      });
      await postWebhook(body, `${await sign(body)}`);
    }
    const startedAt = (await ctx.prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } })).startedAt!;

    const leftBody = payload({
      event: 'participant_left',
      room: { name: ROOM },
      participant: { identity: bob.id },
      createdAt: String(eventTimeSeconds()),
    });
    await postWebhook(leftBody, `${await sign(leftBody)}`);

    const rejoinBody = payload({
      event: 'participant_joined',
      room: { name: ROOM },
      participant: { identity: bob.id },
      createdAt: String(eventTimeSeconds()),
    });
    await postWebhook(rejoinBody, `${await sign(rejoinBody)}`);

    const finalLesson = await ctx.prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(finalLesson.allDisconnectedSince).toBeNull();
    expect(finalLesson.startedAt!.getTime()).toBe(startedAt.getTime());
  });

  it('participant_left_of_the_last_participant_stamps_all_disconnected_since', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const lesson = await openLesson(alice.id);
    const joinBody = payload({
      event: 'participant_joined',
      room: { name: ROOM },
      participant: { identity: alice.id },
      createdAt: String(eventTimeSeconds()),
    });
    await postWebhook(joinBody, `${await sign(joinBody)}`);

    const leftEventTime = eventTimeSeconds();
    const leftBody = payload({
      event: 'participant_left',
      room: { name: ROOM },
      participant: { identity: alice.id },
      createdAt: String(leftEventTime),
    });
    const response = await postWebhook(leftBody, `${await sign(leftBody)}`);

    expect(response.status).toBe(200);
    const row = await ctx.prisma.lessonParticipant.findFirstOrThrow({ where: { userId: alice.id } });
    expect(row.connected).toBe(false);

    const updatedLesson = await ctx.prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(Math.floor(updatedLesson.allDisconnectedSince!.getTime() / 1000)).toBe(leftEventTime);
  });

  it('room_finished_finalizes_an_open_lesson', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const lesson = await openLesson(alice.id);
    const body = payload({ event: 'room_finished', room: { name: ROOM }, createdAt: String(eventTimeSeconds()) });

    const response = await postWebhook(body, `${await sign(body)}`);

    expect(response.status).toBe(200);
    const finalLesson = await ctx.prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(finalLesson.status).toBe('ended_unexpectedly');
    expect(finalLesson.endReason).toBe('all_disconnected');
    expect(finalLesson.endedAt).not.toBeNull();
  });

  it('room_finished_is_a_no_op_on_a_terminal_lesson', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const lesson = await ctx.prisma.lesson.create({
      data: {
        room: ROOM,
        openedBy: alice.id,
        maxParticipants: 2,
        status: 'ended',
        startedAt: new Date(Date.now() - 60_000),
        endedAt: new Date(),
        endReason: 'ended_by_participant',
        endedBy: alice.id,
      },
    });
    const body = payload({ event: 'room_finished', room: { name: ROOM }, createdAt: String(eventTimeSeconds()) });

    // No lesson is "open" for this room any more, so the handler finds
    // nothing to finalize — exactly the no-op the spec requires.
    const response = await postWebhook(body, `${await sign(body)}`);

    expect(response.status).toBe(200);
    const unchanged = await ctx.prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(unchanged.endReason).toBe('ended_by_participant');
    expect(unchanged.endedAt!.getTime()).toBe(lesson.endedAt!.getTime());
  });

  it('an_unknown_event_type_is_acknowledged', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const lesson = await openLesson(alice.id);
    const body = payload({
      event: 'track_published',
      room: { name: ROOM },
      participant: { identity: alice.id },
      createdAt: String(eventTimeSeconds()),
    });

    const response = await postWebhook(body, `${await sign(body)}`);

    expect(response.status).toBe(200);
    expect(await ctx.prisma.lessonParticipant.count({ where: { lessonId: lesson.id } })).toBe(0);
    const unchanged = await ctx.prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(unchanged.status).toBe('waiting');
  });
});

describe('cross-feature integration (PRD Section 9)', () => {
  it('the_lesson_record_carries_the_start_timestamp_and_identities_f07_will_use', async () => {
    const alice = await seedUser('alice@example.com', 'Alice');
    const bob = await seedUser('bob@example.com', 'Bob');
    const lesson = await openLesson(alice.id);

    for (const user of [alice, bob]) {
      const body = payload({
        event: 'participant_joined',
        room: { name: ROOM },
        participant: { identity: user.id },
        createdAt: String(eventTimeSeconds()),
      });
      await postWebhook(body, `${await sign(body)}`);
    }

    const finalLesson = await ctx.prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(finalLesson.startedAt).not.toBeNull();

    const rows = await ctx.prisma.lessonParticipant.findMany({ where: { lessonId: lesson.id } });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.identity).toBe(row.userId);
      expect(row.joinedAt).not.toBeNull();
    }
  });
});
