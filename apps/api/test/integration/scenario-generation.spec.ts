import { vocabularyDomainSchema } from '@english-quest/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

vi.mock('@google/genai', async () => (await import('./helpers/fake-gemini')).fakeGeminiModule);

import { resetEnvCache } from '../../src/config/env';
import { PromptExecutionService } from '../../src/prompts/prompt-execution.service';
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
let execute: MockInstance<PromptExecutionService['execute']>;

beforeAll(async () => {
  ctx = await createScenarioTestContext();
  execute = vi.spyOn(ctx.app.get(PromptExecutionService), 'execute');
}, 180_000);

afterAll(async () => {
  await ctx?.close();
});

beforeEach(async () => {
  await resetTables(ctx);
  gemini.reset();
  execute.mockClear();
});

afterEach(async () => {
  gemini.reset();
  await settleGeneration(ctx);
  process.env.LESSON_MAX_PARTICIPANTS = '2';
  resetEnvCache();
});

function requestToken(user: SeededUser) {
  return request(ctx.app.getHttpServer()).post('/classroom/token').set('Cookie', user.cookie);
}

function readScenario() {
  return ctx.prisma.lessonScenario.findFirstOrThrow();
}

function readCards() {
  return ctx.prisma.lessonRoleCard.findMany({ orderBy: { createdAt: 'asc' } });
}

async function waitForReadyScenario() {
  return waitFor(readScenario, (scenario) => scenario.status !== 'pending');
}

async function waitForCards(count: number) {
  return waitFor(readCards, (cards) => cards.length === count && cards.every((card) => card.status !== 'pending'));
}

/** Opener registers, the situation is generated, then the second participant registers. */
async function pairReady(): Promise<{ alice: SeededUser; bob: SeededUser }> {
  const alice = await seedUser(ctx, 'alice@example.com', 'Alice');
  const bob = await seedUser(ctx, 'bob@example.com', 'Bob');
  await requestToken(alice);
  await waitForReadyScenario();
  await requestToken(bob);
  await waitForCards(2);
  return { alice, bob };
}

function roleLabels(roles: unknown): string[] {
  return (roles as Array<{ label: string }>).map((role) => role.label);
}

describe('scenario generation fan-out', () => {
  it('opening_a_lesson_starts_the_situation', async () => {
    const alice = await seedUser(ctx, 'alice@example.com', 'Alice');

    await requestToken(alice);

    expect(await ctx.prisma.lessonScenario.count()).toBe(1);
    const scenario = await waitForReadyScenario();
    expect(scenario.status).toBe('ready');
    expect(execute).toHaveBeenCalledWith(alice.id, 'scenario-situation', expect.any(Object));
    expect(gemini.callsOf('situation').map((call) => call.apiKey)).toEqual([alice.geminiKey]);
  });

  it('the_situation_has_one_role_per_seat', async () => {
    const alice = await seedUser(ctx, 'alice@example.com', 'Alice');
    await requestToken(alice);
    const pair = await waitForReadyScenario();
    expect(pair.roles as unknown[]).toHaveLength(2);
    expect(gemini.callsOf('situation')[0]?.message).toContain('for 2 participants');

    await resetTables(ctx);
    gemini.reset();
    process.env.LESSON_MAX_PARTICIPANTS = '3';
    resetEnvCache();

    const carol = await seedUser(ctx, 'carol@example.com', 'Carol');
    await requestToken(carol);
    const group = await waitForReadyScenario();
    expect(group.roles as unknown[]).toHaveLength(3);
    expect(gemini.callsOf('situation')[0]?.message).toContain('for 3 participants');
  });

  it('three_participants_each_receive_exactly_one_card', async () => {
    process.env.LESSON_MAX_PARTICIPANTS = '3';
    resetEnvCache();
    const people = [
      await seedUser(ctx, 'alice@example.com', 'Alice'),
      await seedUser(ctx, 'bob@example.com', 'Bob'),
      await seedUser(ctx, 'carol@example.com', 'Carol'),
    ];

    await requestToken(people[0]!);
    const scenario = await waitForReadyScenario();
    await requestToken(people[1]!);
    await requestToken(people[2]!);
    const cards = await waitForCards(3);

    expect(scenario.roles as unknown[]).toHaveLength(3);
    expect(cards.map((card) => card.userId).sort()).toEqual(people.map((person) => person.id).sort());
    expect(new Set(cards.map((card) => card.roleLabel)).size).toBe(3);
    expect(cards.every((card) => card.status === 'ready')).toBe(true);
  });

  it('each_card_is_generated_with_its_own_owners_key', async () => {
    const { alice, bob } = await pairReady();

    const cards = await readCards();
    for (const card of cards) {
      const owner = card.userId === alice.id ? alice : bob;
      const call = gemini.callsOf('card').find((entry) => entry.message.includes(`This card is for the role: ${card.roleLabel}`));
      expect(call?.apiKey).toBe(owner.geminiKey);
      expect(execute).toHaveBeenCalledWith(owner.id, 'scenario-role-card', expect.objectContaining({ own_role_label: card.roleLabel }));
    }
    expect(execute).not.toHaveBeenCalledWith(alice.id, 'scenario-role-card', expect.objectContaining({ own_role_label: cards.find((c) => c.userId === bob.id)?.roleLabel }));
  });

  it('the_situation_request_carries_no_profile_data', async () => {
    const alice = await seedUser(ctx, 'alice@example.com', 'Alice');
    await requestToken(alice);
    await waitForReadyScenario();

    const message = gemini.callsOf('situation')[0]!.message;
    expect(message).not.toContain(alice.id);
    expect(message).not.toContain('Alice');
    expect(message).not.toContain(alice.email);
    const [, , variables] = execute.mock.calls.find(([, promptId]) => promptId === 'scenario-situation')!;
    expect(Object.keys(variables as object).sort()).toEqual(['participant_count', 'vocabulary_domain']);
  });

  it('the_role_card_prompt_receives_only_the_other_roles_labels', async () => {
    const { alice, bob } = await pairReady();
    const scenario = await readScenario();
    const cards = await readCards();
    const aliceCard = cards.find((card) => card.userId === alice.id)!;
    const bobCard = cards.find((card) => card.userId === bob.id)!;
    const bobRole = (scenario.roles as Array<{ label: string; relationship: string }>).find((role) => role.label === bobCard.roleLabel)!;

    const aliceMessage = gemini.callsOf('card').find((call) => call.apiKey === alice.geminiKey)!.message;
    expect(aliceMessage).toContain(`The other roles in this conversation (labels only): ${bobRole.label}`);
    expect(aliceMessage).not.toContain(bobRole.relationship);
    expect(aliceMessage).not.toContain(bobCard.background!);
    expect(aliceMessage).not.toContain(bobCard.objective!);
    expect(aliceCard.roleLabel).not.toBe(bobCard.roleLabel);
  });

  it('every_card_elaborates_a_role_from_the_situation', async () => {
    await pairReady();
    const scenario = await readScenario();
    const labels = roleLabels(scenario.roles);
    const cards = await readCards();

    for (const card of cards) {
      expect(labels).toContain(card.roleLabel);
    }
    expect(new Set(cards.map((card) => card.roleLabel)).size).toBe(cards.length);
  });

  it('assigns_distinct_roles_when_both_cards_are_generated_together', async () => {
    // The common case: the second participant registers while the situation
    // is still generating, so both cards are produced in parallel.
    const alice = await seedUser(ctx, 'alice@example.com', 'Alice');
    const bob = await seedUser(ctx, 'bob@example.com', 'Bob');
    const release = gemini.holdSituations();
    await requestToken(alice);
    await requestToken(bob);
    release();

    const cards = await waitForCards(2);
    expect(new Set(cards.map((card) => card.roleLabel)).size).toBe(2);
  });

  it('role_assignment_varies_across_lessons', async () => {
    const alice = await seedUser(ctx, 'alice@example.com', 'Alice');
    const bob = await seedUser(ctx, 'bob@example.com', 'Bob');
    const aliceIndexes: number[] = [];

    for (let lesson = 0; lesson < 4; lesson++) {
      const token = await requestToken(alice);
      await waitFor(
        () => ctx.prisma.lessonScenario.findUniqueOrThrow({ where: { lessonId: token.body.data.lessonId } }),
        (scenario) => scenario.status === 'ready',
      );
      await requestToken(bob);
      await waitFor(
        () => ctx.prisma.lessonRoleCard.findMany({ where: { lessonId: token.body.data.lessonId } }),
        (cards) => cards.length === 2 && cards.every((card) => card.status === 'ready'),
      );

      const scenario = await ctx.prisma.lessonScenario.findUniqueOrThrow({ where: { lessonId: token.body.data.lessonId } });
      const aliceCard = await ctx.prisma.lessonRoleCard.findFirstOrThrow({
        where: { lessonId: token.body.data.lessonId, userId: alice.id },
      });
      aliceIndexes.push(roleLabels(scenario.roles).indexOf(aliceCard.roleLabel!));

      await request(ctx.app.getHttpServer())
        .post(`/classroom/${token.body.data.lessonId}/end`)
        .set('Cookie', alice.cookie)
        .expect(200);
    }

    for (let i = 1; i < aliceIndexes.length; i++) {
      expect(aliceIndexes[i], `lesson ${i + 1} repeated the previous lesson's side`).not.toBe(aliceIndexes[i - 1]);
    }
  });

  it('a_missing_gemini_key_flags_no_scenario', async () => {
    const alice = await seedUser(ctx, 'alice@example.com', 'Alice', { withKey: false });
    const bob = await seedUser(ctx, 'bob@example.com', 'Bob');

    await requestToken(alice);
    const scenario = await waitForReadyScenario();

    expect(scenario.status).toBe('no_scenario');
    expect(gemini.calls).toHaveLength(0);
    // Nothing blocks the lesson: the second participant still gets a token.
    expect((await requestToken(bob)).status).toBe(200);
    expect(await ctx.prisma.lessonRoleCard.count()).toBe(0);
  });

  it('a_failed_situation_leaves_the_lesson_startable', async () => {
    const alice = await seedUser(ctx, 'alice@example.com', 'Alice');
    const bob = await seedUser(ctx, 'bob@example.com', 'Bob');
    gemini.failSituations = 2;

    await requestToken(alice);
    const scenario = await waitForReadyScenario();

    expect(scenario.status).toBe('failed');
    expect(gemini.callsOf('situation')).toHaveLength(2);
    expect((await requestToken(bob)).status).toBe(200);
    const view = await request(ctx.app.getHttpServer()).get('/classroom/scenario').set('Cookie', alice.cookie);
    expect(view.body.data.status).toBe('failed');
  });

  it('a_situation_with_fewer_roles_than_seats_counts_as_failed', async () => {
    const alice = await seedUser(ctx, 'alice@example.com', 'Alice');
    gemini.shortOnRoles = true;

    await requestToken(alice);
    const scenario = await waitForReadyScenario();

    // Schema-valid, but a seat would be left without a role to play.
    expect(scenario.status).toBe('failed');
    expect(scenario.roles).toBeNull();
  });

  it('a_failed_card_does_not_block_the_lesson', async () => {
    const alice = await seedUser(ctx, 'alice@example.com', 'Alice');
    const bob = await seedUser(ctx, 'bob@example.com', 'Bob');
    gemini.failCardKeys.add(bob.geminiKey!);

    await requestToken(alice);
    await waitForReadyScenario();
    await requestToken(bob);
    const cards = await waitForCards(2);

    expect((await readScenario()).status).toBe('ready');
    const bobCard = cards.find((card) => card.userId === bob.id)!;
    const aliceCard = cards.find((card) => card.userId === alice.id)!;
    expect(bobCard.status).toBe('failed');
    expect(bobCard.roleLabel).not.toBeNull();
    expect(aliceCard.status).toBe('ready');
  });

  it('generation_stamps_the_prompt_id_and_version', async () => {
    await pairReady();

    const scenario = await readScenario();
    expect(scenario.promptId).toBe('scenario-situation');
    expect(scenario.promptVersion).toBe('2');
    for (const card of await readCards()) {
      expect(card.promptId).toBe('scenario-role-card');
      expect(card.promptVersion).toBe('1');
    }
  });

  it('weakness_tags_are_absent_until_a_profile_exists', async () => {
    const { alice } = await pairReady();

    const [, , variables] = execute.mock.calls.find(
      ([userId, promptId]) => userId === alice.id && promptId === 'scenario-role-card',
    )!;
    expect((variables as Record<string, string>).weakness_tags).toBe('');
    const card = await ctx.prisma.lessonRoleCard.findFirstOrThrow({ where: { userId: alice.id } });
    expect(card.status).toBe('ready');
    expect(card.targetExpressions as string[]).toHaveLength(6);
  });
});

describe('cross-feature integration (PRD Section 9)', () => {
  it('the_situation_role_labels_are_what_the_card_prompt_receives', async () => {
    await pairReady();
    const scenario = await readScenario();
    const labels = roleLabels(scenario.roles);

    for (const card of await readCards()) {
      const call = gemini.callsOf('card').find((entry) => entry.message.includes(`This card is for the role: ${card.roleLabel}`))!;
      expect(call.message).toContain(`Setting: ${scenario.setting}`);
      expect(call.message).toContain(`Premise: ${scenario.premise}`);
      const others = labels.filter((label) => label !== card.roleLabel).join(', ');
      expect(call.message).toContain(`(labels only): ${others}`);
    }
  });

  it('prompt_execution_stamps_its_id_and_version_on_both_artifacts', async () => {
    await pairReady();

    const scenario = await readScenario();
    const cards = await readCards();
    expect(scenario.promptId && scenario.promptVersion).toBeTruthy();
    expect(cards.every((card) => card.promptId && card.promptVersion)).toBe(true);
    const telemetry = await ctx.prisma.promptExecution.findMany();
    expect(telemetry.filter((row) => row.promptId === 'scenario-situation' && row.promptVersion === '2')).toHaveLength(1);
    expect(telemetry.filter((row) => row.promptId === 'scenario-role-card')).toHaveLength(2);
  });

  it('only_the_owners_gemini_key_is_used_for_their_own_card', async () => {
    const { alice, bob } = await pairReady();

    const usage = await ctx.prisma.credentialUsage.findMany();
    const situationUse = usage.filter((row) => row.feature === 'F04_scenario-situation');
    const cardUse = usage.filter((row) => row.feature === 'F04_scenario-role-card');
    expect(situationUse.map((row) => row.userId)).toEqual([alice.id]);
    expect(cardUse.map((row) => row.userId).sort()).toEqual([alice.id, bob.id].sort());
    expect(usage.every((row) => row.outcome === 'ok')).toBe(true);
  });

  it('the_vocabulary_domain_is_one_f20_can_count', async () => {
    gemini.echoedDomain = 'airports and the misery of travel';
    const alice = await seedUser(ctx, 'alice@example.com', 'Alice');
    await requestToken(alice);
    const scenario = await waitForReadyScenario();

    expect(vocabularyDomainSchema.options).toContain(scenario.vocabularyDomain);
    expect(scenario.vocabularyDomain).not.toBe(gemini.echoedDomain);
    expect(gemini.callsOf('situation')[0]!.message).toContain(
      `The vocabulary domain for this conversation is: ${scenario.vocabularyDomain}`,
    );
  });
});
