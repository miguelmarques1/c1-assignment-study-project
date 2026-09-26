import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { LearningProfileReader } from '../../src/profile/learning-profile.reader';
import { roundScore } from '../../src/profile/profile-fold';
import { DAY_MS, PARTIAL_UPDATE_BLOCKED_NOTE } from '../../src/profile/profile.constants';
import { ProfileIngestionService } from '../../src/profile/profile-ingestion.service';
import {
  lessonSourceInput,
  makeProfiledLesson,
  seedLesson,
  seedProfileSource,
  seedSpeaker,
  type ProfileOccurrenceSeed,
  type Speaker,
} from './helpers/pipeline-fixtures';
import { createTestContext, type TestContext } from './helpers/test-app';

let ctx: TestContext;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

function errors(tag: string, count: number, quote = 'a sentence'): ProfileOccurrenceSeed[] {
  return Array.from({ length: count }, (_, index) => ({ tag, quote: `${quote} ${index + 1}`, correction: `fix ${index + 1}` }));
}

function get(path: string, speaker?: Speaker) {
  const call = request(ctx.app.getHttpServer()).get(path);
  return speaker ? call.set('Cookie', speaker.cookie) : call;
}

beforeAll(async () => {
  ctx = await createTestContext();
}, 180_000);

afterAll(async () => {
  await ctx?.close();
});

beforeEach(async () => {
  await ctx.prisma.lesson.deleteMany();
  await ctx.prisma.user.deleteMany();
});

describe('profile routes', () => {
  it('returns_six_competencies_in_order_with_rounding_and_deltas', async () => {
    const ana = await seedSpeaker(ctx, 'Ana', { withKey: false });
    await makeProfiledLesson(ctx, ana.id, {
      startedAt: daysAgo(3),
      scores: { grammar: 70, vocabulary: 60, fluency: 50, interaction: 40, comprehension: 30 },
      pronunciation: { value: 70.4, accuracy: 80.5, prosody: null },
    });
    await makeProfiledLesson(ctx, ana.id, {
      startedAt: daysAgo(1),
      scores: { grammar: 90, vocabulary: 60, fluency: 50, interaction: 40, comprehension: 30 },
      pronunciation: { value: 80, accuracy: 90, prosody: 60 },
    });

    const response = await get('/profile', ana);

    expect(response.status).toBe(200);
    const { competencies } = response.body.data;
    expect(competencies.map((entry: { competency: string }) => entry.competency)).toEqual([
      'grammar',
      'vocabulary',
      'fluency',
      'interaction',
      'comprehension',
      'pronunciation',
    ]);
    // 70 then 90 at 0.35: 77, delta 77 − 70.
    expect(competencies[0]).toMatchObject({ score: 77, delta: 7, measurementCount: 2, warmingUp: true, trend: null, subScores: null });
    expect(competencies[1]).toMatchObject({ score: 60, delta: 0 });
    // 70.4 then 80 → 73.76; accuracy 80.5 then 90 → 83.825; prosody only once → 60.
    expect(competencies[5]).toMatchObject({ score: 74, delta: 4, subScores: { accuracy: 84, prosody: 60 } });
    for (const entry of competencies) {
      expect(Number.isInteger(entry.score)).toBe(true);
    }
    expect(response.body.data.empty).toBe(false);
    expect(response.body.data.updatedAt).not.toBeNull();
    expect(Date.parse(response.body.data.serverTime)).not.toBeNaN();
  });

  it('a_new_user_gets_an_empty_profile', async () => {
    const ana = await seedSpeaker(ctx, 'Ana', { withKey: false });

    const response = await get('/profile', ana);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ empty: true, updatedAt: null, recurringWeaknesses: [], notes: [] });
    expect(response.body.data.competencies).toHaveLength(6);
    for (const entry of response.body.data.competencies) {
      expect(entry).toMatchObject({ score: null, delta: null, measurementCount: 0, warmingUp: true, trend: null });
    }
  });

  it('warming_up_competencies_carry_no_trend', async () => {
    const ana = await seedSpeaker(ctx, 'Ana', { withKey: false });
    for (const [days, grammar] of [[5, 60], [3, 70], [1, 80]] as const) {
      await makeProfiledLesson(ctx, ana.id, { startedAt: daysAgo(days), scores: { grammar } });
    }
    await ctx.app.get(ProfileIngestionService).ingestActivityOutcome({
      userId: ana.id,
      activityId: crypto.randomUUID(),
      sourceKey: crypto.randomUUID(),
      activityType: 'vocabulary',
      occurredAt: new Date(),
      measurements: [{ competency: 'vocabulary', value: 55 }],
      errorOccurrences: [],
      correctEncounters: [],
    });

    const { competencies } = (await get('/profile', ana)).body.data;

    expect(competencies[0]).toMatchObject({ competency: 'grammar', measurementCount: 3, warmingUp: false, trend: 'up' });
    expect(competencies[1]).toMatchObject({ competency: 'vocabulary', measurementCount: 1, warmingUp: true, trend: null });
  });

  it('recurring_weaknesses_list_exactly_the_qualifying_tags', async () => {
    const ana = await seedSpeaker(ctx, 'Ana', { withKey: false });
    // Old evidence: three occurrences 40 days ago, none recent.
    await makeProfiledLesson(ctx, ana.id, { startedAt: daysAgo(40), errors: errors('grammar:past-simple', 3) });
    await makeProfiledLesson(ctx, ana.id, {
      startedAt: daysAgo(2),
      errors: [
        ...errors('grammar:conditional-3', 4),
        ...errors('vocab:collocation', 3),
        ...errors('discourse:connector', 2),
        ...errors('grammar:past-simple', 1),
      ],
    });

    const { recurringWeaknesses } = (await get('/profile', ana)).body.data;

    expect(recurringWeaknesses.map((entry: { tag: string }) => entry.tag)).toEqual(['grammar:conditional-3', 'vocab:collocation']);
    expect(recurringWeaknesses[0]).toMatchObject({
      label: 'Third conditional',
      family: 'grammar',
      occurrenceCount: 4,
      recentOccurrenceCount: 4,
      state: 'new',
      dueAt: null,
      trend: 'rising',
      retired: false,
    });
  });

  it('renders_the_partial_update_note', async () => {
    const ana = await seedSpeaker(ctx, 'Ana', { withKey: false });
    const lessonId = await seedLesson(ctx, [ana.id], daysAgo(1));
    await seedProfileSource(
      ctx,
      lessonSourceInput({
        kind: 'lesson_pronunciation',
        userId: ana.id,
        lessonId,
        occurredAt: daysAgo(1),
        pronunciation: { value: 70, accuracy: 70, prosody: 70 },
      }),
    );
    const branch = await ctx.prisma.lessonPipelineBranch.create({
      data: { lessonId, userId: ana.id, stage: 'lesson_analysis', status: 'blocked_missing_key', launchedAt: new Date() },
    });
    await ctx.prisma.lessonPipelineStage.create({
      data: {
        branchId: branch.id,
        stage: 'lesson_analysis',
        status: 'blocked_missing_key',
        queuedAt: new Date(),
        reasonCode: 'credential_missing',
        reason: 'No Gemini key.',
        blockedProvider: 'gemini',
      },
    });

    expect((await get('/profile', ana)).body.data.notes).toEqual([PARTIAL_UPDATE_BLOCKED_NOTE]);
  });

  it('the_ledger_list_filters_by_tag', async () => {
    const ana = await seedSpeaker(ctx, 'Ana', { withKey: false });
    await makeProfiledLesson(ctx, ana.id, {
      startedAt: daysAgo(1),
      phonemes: [{ tag: 'phoneme:/θ/', exampleWords: ['think'] }],
      errors: errors('grammar:conditional-3', 1),
    });

    const all = await get('/profile/ledger', ana);
    expect(all.status).toBe(200);
    expect(all.body.data.entries).toHaveLength(2);

    const one = await get(`/profile/ledger?tag=${encodeURIComponent('phoneme:/θ/')}`, ana);
    expect(one.status).toBe(200);
    expect(one.body.data.entries).toEqual([
      expect.objectContaining({ tag: 'phoneme:/θ/', label: '/θ/ as in "think"', family: 'phoneme' }),
    ]);

    const unknown = await get('/profile/ledger?tag=grammar%3Anever-seen', ana);
    expect(unknown.body.data.entries).toEqual([]);
  });

  it('the_detail_returns_up_to_five_examples_and_every_source', async () => {
    const ana = await seedSpeaker(ctx, 'Ana', { withKey: false });
    const tag = 'grammar:conditional-3';
    const oldest = await makeProfiledLesson(ctx, ana.id, { startedAt: daysAgo(9), errors: errors(tag, 3, 'oldest') });
    const middle = await makeProfiledLesson(ctx, ana.id, { startedAt: daysAgo(5), errors: errors(tag, 2, 'middle') });
    const newest = await makeProfiledLesson(ctx, ana.id, { startedAt: daysAgo(1), errors: errors(tag, 2, 'newest') });
    const [entry] = (await get('/profile/ledger', ana)).body.data.entries;

    const response = await get(`/profile/ledger/${entry.id}`, ana);

    expect(response.status).toBe(200);
    const { examples, sources } = response.body.data;
    expect(response.body.data.entry).toMatchObject({ id: entry.id, occurrenceCount: 7 });
    expect(examples).toHaveLength(5);
    expect(examples.map((example: { lessonId: string }) => example.lessonId)).toEqual([newest, newest, middle, middle, oldest]);
    expect(examples[0]).toMatchObject({ sourceKind: 'lesson', activityId: null, exampleWords: [], instances: 1 });
    expect(examples[0].quote).toMatch(/^newest /);
    expect(examples[0].correction).toMatch(/^fix /);
    expect(sources).toEqual([
      expect.objectContaining({ lessonId: newest, occurrences: 2 }),
      expect.objectContaining({ lessonId: middle, occurrences: 2 }),
      expect.objectContaining({ lessonId: oldest, occurrences: 3 }),
    ]);
  });

  it('the_profile_view_and_the_reader_agree', async () => {
    const ana = await seedSpeaker(ctx, 'Ana', { withKey: false });
    await makeProfiledLesson(ctx, ana.id, {
      startedAt: daysAgo(4),
      scores: { grammar: 63.3, vocabulary: 71.7, fluency: 58.5, interaction: 88.2, comprehension: 49.5 },
      pronunciation: { value: 66.6, accuracy: 77.7, prosody: 55.5 },
      errors: errors('vocab:collocation', 3),
    });
    await makeProfiledLesson(ctx, ana.id, {
      startedAt: daysAgo(2),
      scores: { grammar: 81.1, vocabulary: 52.9, fluency: 64.4, interaction: 70.5, comprehension: 91.3 },
      pronunciation: { value: 73.2, accuracy: 69.9, prosody: 60.1 },
    });

    const view = (await get('/profile', ana)).body.data;
    const snapshot = await ctx.app.get(LearningProfileReader).snapshotFor(ana.id);

    snapshot.competencies.forEach((entry, index) => {
      expect(view.competencies[index].score).toBe(roundScore(entry.score!));
      expect(view.competencies[index].delta).toBe(roundScore(entry.score!) - roundScore(entry.previousScore!));
      expect(view.competencies[index].measurementCount).toBe(entry.measurementCount);
    });
    expect(view.recurringWeaknesses.map((entry: { id: string }) => entry.id)).toEqual(
      snapshot.recurringWeaknesses.map((entry) => entry.id),
    );
  });

  it('never_returns_another_users_profile_or_ledger', async () => {
    const ana = await seedSpeaker(ctx, 'Ana', { withKey: false });
    const bruno = await seedSpeaker(ctx, 'Bruno', { withKey: false });
    const anaLesson = await makeProfiledLesson(ctx, ana.id, {
      startedAt: daysAgo(2),
      scores: { grammar: 11, vocabulary: 12, fluency: 13, interaction: 14, comprehension: 15 },
      errors: errors('grammar:conditional-3', 3, 'ana-only quote'),
    });
    const brunoLesson = await makeProfiledLesson(ctx, bruno.id, {
      startedAt: daysAgo(2),
      scores: { grammar: 91, vocabulary: 92, fluency: 93, interaction: 94, comprehension: 95 },
      errors: errors('vocab:phrasal-verb', 3, 'bruno-only quote'),
    });
    const brunoEntry = await ctx.prisma.errorLedgerEntry.findFirstOrThrow({ where: { userId: bruno.id } });
    const anaEntry = await ctx.prisma.errorLedgerEntry.findFirstOrThrow({ where: { userId: ana.id } });

    const responses = [
      await get('/profile', ana),
      await get('/profile/ledger', ana),
      await get(`/profile/ledger/${anaEntry.id}`, ana),
    ];
    for (const response of responses) {
      expect(response.status).toBe(200);
      const body = JSON.stringify(response.body);
      expect(body).not.toContain('vocab:phrasal-verb');
      expect(body).not.toContain('bruno-only quote');
      expect(body).not.toContain(brunoEntry.id);
      expect(body).not.toContain(brunoLesson);
      expect(body).not.toContain(bruno.id);
    }
    expect(responses[0]!.body.data.competencies.slice(0, 5).map((entry: { score: number }) => entry.score)).toEqual([
      11, 12, 13, 14, 15,
    ]);
    expect(JSON.stringify(responses[2]!.body)).toContain(anaLesson);
  });

  it('another_users_entry_is_not_found', async () => {
    const ana = await seedSpeaker(ctx, 'Ana', { withKey: false });
    const bruno = await seedSpeaker(ctx, 'Bruno', { withKey: false });
    await makeProfiledLesson(ctx, bruno.id, { startedAt: daysAgo(2), errors: errors('vocab:phrasal-verb', 1) });
    const brunoEntry = await ctx.prisma.errorLedgerEntry.findFirstOrThrow({ where: { userId: bruno.id } });

    const foreign = await get(`/profile/ledger/${brunoEntry.id}`, ana);
    const unknown = await get(`/profile/ledger/${crypto.randomUUID()}`, ana);

    for (const response of [foreign, unknown]) {
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('PROF001');
    }
    expect(foreign.body).toEqual(unknown.body);
  });

  it('rejects_a_malformed_entry_id_and_tag', async () => {
    const ana = await seedSpeaker(ctx, 'Ana', { withKey: false });

    const badId = await get('/profile/ledger/not-a-uuid', ana);
    const shortTag = await get('/profile/ledger?tag=ab', ana);
    const longTag = await get(`/profile/ledger?tag=${'x'.repeat(65)}`, ana);

    for (const response of [badId, shortTag, longTag]) {
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VAL001');
    }
  });

  it('requires_authentication', async () => {
    for (const path of ['/profile', '/profile/ledger', `/profile/ledger/${crypto.randomUUID()}`]) {
      const response = await get(path);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('AUTH003');
    }
  });
});
