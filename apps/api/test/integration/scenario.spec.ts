import { ERROR_CODES } from '@english-quest/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@google/genai', async () => (await import('./helpers/fake-gemini')).fakeGeminiModule);

import { gemini } from './helpers/fake-gemini';
import {
  createScenarioTestContext,
  resetTables,
  seedUser,
  settleGeneration,
  waitFor,
  type SeededUser,
} from './helpers/scenario-fixtures';
import type { TestContext } from './helpers/test-app';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createScenarioTestContext();
}, 180_000);

afterAll(async () => {
  await ctx?.close();
});

beforeEach(async () => {
  await resetTables(ctx);
  gemini.reset();
});

afterEach(async () => {
  gemini.reset();
  await settleGeneration(ctx);
});

function http() {
  return request(ctx.app.getHttpServer());
}

function requestToken(user: SeededUser) {
  return http().post('/classroom/token').set('Cookie', user.cookie);
}

function readView(user: SeededUser) {
  return http().get('/classroom/scenario').set('Cookie', user.cookie);
}

async function waitForSituation() {
  return waitFor(
    () => ctx.prisma.lessonScenario.findFirstOrThrow(),
    (scenario) => scenario.status !== 'pending',
  );
}

async function waitForCards(count: number) {
  return waitFor(
    () => ctx.prisma.lessonRoleCard.findMany(),
    (cards) => cards.length === count && cards.every((card) => card.status !== 'pending'),
  );
}

async function pairReady(): Promise<{ alice: SeededUser; bob: SeededUser }> {
  const alice = await seedUser(ctx, 'alice@example.com', 'Alice');
  const bob = await seedUser(ctx, 'bob@example.com', 'Bob');
  await requestToken(alice);
  await waitForSituation();
  await requestToken(bob);
  await waitForCards(2);
  return { alice, bob };
}

describe('scenario read', () => {
  it('returns_null_when_no_lesson_is_open', async () => {
    const alice = await seedUser(ctx, 'alice@example.com', 'Alice');

    const response = await readView(alice);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: null });
  });

  it('reports_pending_while_the_situation_is_generating', async () => {
    const alice = await seedUser(ctx, 'alice@example.com', 'Alice');
    const release = gemini.holdSituations();

    await requestToken(alice);
    await waitFor(() => ctx.prisma.lessonScenario.count(), (count) => count === 1);
    const response = await readView(alice);
    release();

    expect(response.body.data.status).toBe('pending');
    expect(response.body.data.situation).toBeNull();
    expect(response.body.data.rerollsRemaining).toBe(3);
  });

  it('returns_the_situation_once_ready', async () => {
    const alice = await seedUser(ctx, 'alice@example.com', 'Alice');
    await requestToken(alice);
    await waitForSituation();

    const { data } = (await readView(alice)).body;

    expect(data.status).toBe('ready');
    expect(data.situation.title).toBeTypeOf('string');
    expect(data.situation.setting).toBeTypeOf('string');
    expect(data.situation.premise).toBeTypeOf('string');
    expect(data.situation.roles).toHaveLength(2);
    expect(data.situation.vocabularyDomain).toBeTypeOf('string');
    expect(data.situation.discussionHooks.length).toBeGreaterThanOrEqual(3);
    expect(data.canReroll).toBe(true);
  });

  it('never_returns_another_participants_card', async () => {
    const { alice, bob } = await pairReady();
    const cards = await ctx.prisma.lessonRoleCard.findMany();
    const aliceCard = cards.find((card) => card.userId === alice.id)!;
    const bobCard = cards.find((card) => card.userId === bob.id)!;

    const aliceBody = JSON.stringify((await readView(alice)).body);
    const bobBody = JSON.stringify((await readView(bob)).body);

    expect(aliceBody).toContain(aliceCard.objective!);
    for (const privateText of [bobCard.background!, bobCard.objective!, bobCard.constraintText!]) {
      expect(aliceBody).not.toContain(privateText);
    }
    for (const expression of bobCard.targetExpressions as string[]) {
      if (!(aliceCard.targetExpressions as string[]).includes(expression)) {
        expect(aliceBody).not.toContain(expression);
      }
    }
    for (const privateText of [aliceCard.background!, aliceCard.objective!, aliceCard.constraintText!]) {
      expect(bobBody).not.toContain(privateText);
    }
  });

  it('carries_the_role_label_before_the_card_exists', async () => {
    const alice = await seedUser(ctx, 'alice@example.com', 'Alice');
    const release = gemini.holdCards();

    await requestToken(alice);
    await waitFor(
      () => ctx.prisma.lessonRoleCard.findFirst(),
      (card) => Boolean(card?.roleLabel),
    );
    const { data } = (await readView(alice)).body;
    release();

    expect(data.myRoleLabel).toBeTypeOf('string');
    expect(data.myCard.status).toBe('pending');
    expect(data.myCard.objective).toBeNull();
  });
});

describe('reroll and retry', () => {
  it('reroll_regenerates_the_situation_and_every_card', async () => {
    const { alice, bob } = await pairReady();
    const before = await ctx.prisma.lessonScenario.findFirstOrThrow();
    gemini.calls = [];

    const response = await http().post('/classroom/scenario/reroll').set('Cookie', alice.cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('pending');
    expect(response.body.data.rerollsRemaining).toBe(2);

    const after = await waitForSituation();
    await waitForCards(2);
    expect(after.rerollCount).toBe(1);
    expect(after.title).not.toBe(before.title);
    const cardKeys = gemini.callsOf('card').map((call) => call.apiKey).sort();
    expect(cardKeys).toEqual([alice.geminiKey, bob.geminiKey].sort());
    const cards = await ctx.prisma.lessonRoleCard.findMany();
    expect(cards.every((card) => card.status === 'ready')).toBe(true);
  });

  it('reroll_is_blocked_at_the_limit', async () => {
    const alice = await seedUser(ctx, 'alice@example.com', 'Alice');
    await requestToken(alice);
    await waitForSituation();
    await ctx.prisma.lessonScenario.updateMany({ data: { rerollCount: 3 } });

    const response = await http().post('/classroom/scenario/reroll').set('Cookie', alice.cookie);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe(ERROR_CODES.SCENARIO_REROLL_LIMIT);
    expect(response.body.error.message).toBe('You have used all 3 rerolls for this lesson.');
    expect(response.body.error.details).toEqual({ limit: 3 });
    expect((await ctx.prisma.lessonScenario.findFirstOrThrow()).rerollCount).toBe(3);
  });

  it('reroll_is_rejected_after_the_lesson_started', async () => {
    const alice = await seedUser(ctx, 'alice@example.com', 'Alice');
    await requestToken(alice);
    const before = await waitForSituation();
    await ctx.prisma.lesson.updateMany({ data: { status: 'live', startedAt: new Date() } });

    const response = await http().post('/classroom/scenario/reroll').set('Cookie', alice.cookie);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe(ERROR_CODES.SCENARIO_LOCKED);
    const after = await ctx.prisma.lessonScenario.findFirstOrThrow();
    expect(after).toEqual(before);
  });

  it('reroll_is_rejected_for_a_non_opener', async () => {
    const alice = await seedUser(ctx, 'alice@example.com', 'Alice');
    const bob = await seedUser(ctx, 'bob@example.com', 'Bob');
    await requestToken(alice);
    await waitForSituation();
    await requestToken(bob);

    const response = await http().post('/classroom/scenario/reroll').set('Cookie', bob.cookie);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(ERROR_CODES.SCENARIO_NOT_THE_OPENER);
    expect((await readView(bob)).body.data.canReroll).toBe(false);
  });

  it('retry_does_not_consume_a_reroll', async () => {
    const alice = await seedUser(ctx, 'alice@example.com', 'Alice');
    gemini.failSituations = 2;
    await requestToken(alice);
    expect((await waitForSituation()).status).toBe('failed');

    const response = await http().post('/classroom/scenario/retry').set('Cookie', alice.cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('pending');
    expect(response.body.data.rerollsRemaining).toBe(3);
    const after = await waitForSituation();
    expect(after.status).toBe('ready');
    expect(after.rerollCount).toBe(0);
  });

  it('requires_authentication_on_every_scenario_route', async () => {
    const read = await http().get('/classroom/scenario');
    const reroll = await http().post('/classroom/scenario/reroll');
    const retry = await http().post('/classroom/scenario/retry');

    for (const response of [read, reroll, retry]) {
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe(ERROR_CODES.AUTH_SESSION_INVALID);
    }
  });

  it('rejects_reroll_and_retry_when_no_lesson_is_open', async () => {
    const alice = await seedUser(ctx, 'alice@example.com', 'Alice');

    const reroll = await http().post('/classroom/scenario/reroll').set('Cookie', alice.cookie);
    const retry = await http().post('/classroom/scenario/retry').set('Cookie', alice.cookie);

    expect(reroll.status).toBe(409);
    expect(reroll.body.error.code).toBe(ERROR_CODES.LESSON_NOT_ACTIVE);
    expect(retry.body.error.code).toBe(ERROR_CODES.LESSON_NOT_ACTIVE);
  });
});

describe('cross-feature integration (PRD Section 9)', () => {
  it('the_scenario_attaches_to_the_open_classroom_session', async () => {
    const { alice } = await pairReady();

    const session = (await http().get('/classroom/session').set('Cookie', alice.cookie)).body.data;
    const view = (await readView(alice)).body.data;
    const cards = await ctx.prisma.lessonRoleCard.findMany();

    expect(view.lessonId).toBe(session.lessonId);
    const participantIds = session.participants.map((participant: { userId: string }) => participant.userId);
    expect(cards.map((card) => card.userId).sort()).toEqual([...participantIds].sort());
    expect(cards.every((card) => card.lessonId === session.lessonId)).toBe(true);
  });
});
