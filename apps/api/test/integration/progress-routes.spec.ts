import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DAY_MS } from '../../src/profile/profile.constants';
import { ProfileIngestionService } from '../../src/profile/profile-ingestion.service';
import {
  lessonSourceInput,
  makeProfiledLesson,
  seedLesson,
  seedProfileSource,
  seedSpeaker,
  type Speaker,
} from './helpers/pipeline-fixtures';
import { createTestContext, type TestContext } from './helpers/test-app';

let ctx: TestContext;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

function get(path: string, speaker?: Speaker) {
  const call = request(ctx.app.getHttpServer()).get(path);
  return speaker ? call.set('Cookie', speaker.cookie) : call;
}

function ingestActivity(userId: string, options: { occurredAt: Date; grammar: number; activityId?: string }) {
  return ctx.app.get(ProfileIngestionService).ingestActivityOutcome({
    userId,
    activityId: options.activityId ?? crypto.randomUUID(),
    sourceKey: crypto.randomUUID(),
    activityType: 'vocabulary',
    occurredAt: options.occurredAt,
    measurements: [{ competency: 'grammar', value: options.grammar }],
    errorOccurrences: [],
    correctEncounters: [],
  });
}

function withoutServerTime<T extends { serverTime: string }>(view: T): Omit<T, 'serverTime'> {
  const { serverTime: _serverTime, ...rest } = view;
  return rest;
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

describe('progress routes', () => {
  it('returns_the_callers_profile_and_six_series', async () => {
    const ana = await seedSpeaker(ctx, 'Ana', { withKey: false });
    for (const days of [6, 4, 2]) {
      await makeProfiledLesson(ctx, ana.id, { startedAt: daysAgo(days), scores: { grammar: 70 } });
    }

    const response = await get('/progress', ana);

    expect(response.status).toBe(200);
    const { profile, competencyHistory, serverTime } = response.body.data;
    expect(profile.competencies).toHaveLength(6);
    expect(profile.serverTime).toBe(serverTime);
    expect(competencyHistory.series).toHaveLength(6);
    expect(competencyHistory.series[0]).toMatchObject({ competency: 'grammar' });
    expect(competencyHistory.series[0].points).toHaveLength(3);
    expect(competencyHistory.pointsPerCompetency).toBe(20);
  });

  it('the_embedded_profile_equals_get_profile', async () => {
    const ana = await seedSpeaker(ctx, 'Ana', { withKey: false });
    for (const [days, grammar] of [[9, 60], [6, 70], [3, 80]] as const) {
      await makeProfiledLesson(ctx, ana.id, {
        startedAt: daysAgo(days),
        scores: { grammar },
        pronunciation: { value: 65, accuracy: 70, prosody: 60 },
        errors: Array.from({ length: 3 }, (_, index) => ({ tag: 'grammar:conditional-3', quote: `q ${days} ${index}` })),
      });
    }

    const progress = (await get('/progress', ana)).body.data;
    const profile = (await get('/profile', ana)).body.data;

    expect(withoutServerTime(progress.profile)).toEqual(withoutServerTime(profile));
  });

  it('keeps_the_newest_twenty_points_per_competency_oldest_first', async () => {
    const ana = await seedSpeaker(ctx, 'Ana', { withKey: false });
    for (let index = 0; index < 23; index += 1) {
      await ingestActivity(ana.id, { occurredAt: daysAgo(30 - index), grammar: 40 + index });
    }

    const points = (await get('/progress', ana)).body.data.competencyHistory.series[0].points;

    expect(points).toHaveLength(20);
    const times = points.map((entry: { measuredAt: string }) => Date.parse(entry.measuredAt));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    // The three oldest (indexes 0–2) are gone: the oldest kept point is the fourth ingested.
    expect(times[0]).toBeCloseTo(daysAgo(27).getTime(), -4);
    expect(times[19]).toBeCloseTo(daysAgo(8).getTime(), -4);
  });

  it('the_last_point_equals_the_snapshot_score', async () => {
    const ana = await seedSpeaker(ctx, 'Ana', { withKey: false });
    for (const [days, grammar] of [[8, 61], [6, 72], [4, 55]] as const) {
      await makeProfiledLesson(ctx, ana.id, {
        startedAt: daysAgo(days),
        scores: { grammar, vocabulary: grammar + 3 },
        pronunciation: { value: grammar, accuracy: grammar, prosody: null },
      });
    }
    await ingestActivity(ana.id, { occurredAt: daysAgo(1), grammar: 90 });

    const { profile, competencyHistory } = (await get('/progress', ana)).body.data;

    competencyHistory.series.forEach((series: { points: { score: number }[] }, index: number) => {
      const score = profile.competencies[index].score;
      if (series.points.length === 0) {
        expect(score).toBeNull();
      } else {
        expect(series.points.at(-1)!.score).toBe(score);
      }
    });
  });

  it('lesson_and_activity_points_carry_their_source_kind', async () => {
    const ana = await seedSpeaker(ctx, 'Ana', { withKey: false });
    const lessonId = await makeProfiledLesson(ctx, ana.id, { startedAt: daysAgo(5), scores: { grammar: 70 } });
    const activityId = crypto.randomUUID();
    await ingestActivity(ana.id, { occurredAt: daysAgo(2), grammar: 60, activityId });

    const points = (await get('/progress', ana)).body.data.competencyHistory.series[0].points;

    expect(points).toEqual([
      expect.objectContaining({ sourceKind: 'lesson', lessonId, activityId: null }),
      expect.objectContaining({ sourceKind: 'activity', lessonId: null, activityId }),
    ]);
  });

  it('an_activity_outcome_appears_as_an_activity_point', async () => {
    const ana = await seedSpeaker(ctx, 'Ana', { withKey: false });
    await makeProfiledLesson(ctx, ana.id, { startedAt: daysAgo(4), scores: { grammar: 90 } });
    const before = (await get('/progress', ana)).body.data.competencyHistory.series[0].points;
    expect(before).toHaveLength(1);

    await ingestActivity(ana.id, { occurredAt: daysAgo(1), grammar: 60 });

    const after = (await get('/progress', ana)).body.data.competencyHistory.series[0].points;
    expect(after).toHaveLength(2);
    expect(after[1]).toMatchObject({ sourceKind: 'activity' });
    // 90, then 60 at weight 0.15: 0.85 × 90 + 0.15 × 60 = 85.5, rounded half up.
    expect(after[1].score).toBe(86);
  });

  it('range_boundaries_are_ninety_and_thirty_days_before_server_time', async () => {
    const ana = await seedSpeaker(ctx, 'Ana', { withKey: false });

    const { serverTime, competencyHistory } = (await get('/progress', ana)).body.data;

    const at = Date.parse(serverTime);
    expect(competencyHistory.ranges).toEqual([
      { range: 'all', since: null },
      { range: '90d', since: new Date(at - 90 * DAY_MS).toISOString() },
      { range: '30d', since: new Date(at - 30 * DAY_MS).toISOString() },
    ]);
  });

  it('chartable_is_false_until_a_competency_has_three_measurements', async () => {
    const ana = await seedSpeaker(ctx, 'Ana', { withKey: false });
    const chartable = async () => (await get('/progress', ana)).body.data.competencyHistory.chartable;

    await makeProfiledLesson(ctx, ana.id, { startedAt: daysAgo(6) });
    expect(await chartable()).toBe(false);
    await makeProfiledLesson(ctx, ana.id, { startedAt: daysAgo(4) });
    expect(await chartable()).toBe(false);
    await makeProfiledLesson(ctx, ana.id, { startedAt: daysAgo(2) });
    expect(await chartable()).toBe(true);
  });

  it('warming_up_competencies_carry_no_trend', async () => {
    const ana = await seedSpeaker(ctx, 'Ana', { withKey: false });
    for (const days of [5, 3]) {
      await makeProfiledLesson(ctx, ana.id, {
        startedAt: daysAgo(days),
        scores: { grammar: 70 },
        pronunciation: { value: 70, accuracy: 70, prosody: 60 },
      });
    }

    const { competencies } = (await get('/progress', ana)).body.data.profile;

    expect(competencies[5]).toMatchObject({ competency: 'pronunciation', measurementCount: 2, warmingUp: true, trend: null });
  });

  it('recurring_weaknesses_are_the_profiles_ranked_list', async () => {
    const ana = await seedSpeaker(ctx, 'Ana', { withKey: false });
    const quotes = (tag: string, count: number) =>
      Array.from({ length: count }, (_, index) => ({ tag, quote: `${tag} ${index}` }));
    await makeProfiledLesson(ctx, ana.id, {
      startedAt: daysAgo(3),
      errors: [...quotes('grammar:conditional-3', 4), ...quotes('vocab:phrasal-verb', 3), ...quotes('grammar:article-definite', 1)],
    });

    const progress = (await get('/progress', ana)).body.data.profile.recurringWeaknesses;
    const profile = (await get('/profile', ana)).body.data.recurringWeaknesses;

    expect(progress.map((entry: { tag: string }) => entry.tag)).toEqual(['grammar:conditional-3', 'vocab:phrasal-verb']);
    expect(progress).toEqual(profile);
  });

  it('a_new_user_gets_an_empty_dashboard', async () => {
    const ana = await seedSpeaker(ctx, 'Ana', { withKey: false });

    const response = await get('/progress', ana);

    expect(response.status).toBe(200);
    const { profile, competencyHistory } = response.body.data;
    expect(profile.empty).toBe(true);
    expect(competencyHistory.series).toHaveLength(6);
    expect(competencyHistory.series.every((series: { points: unknown[] }) => series.points.length === 0)).toBe(true);
    expect(competencyHistory.chartable).toBe(false);
  });

  it('never_returns_another_participants_data', async () => {
    const ana = await seedSpeaker(ctx, 'Ana', { withKey: false });
    const bruno = await seedSpeaker(ctx, 'Bruno', { withKey: false });
    const shared = await seedLesson(ctx, [ana.id, bruno.id], daysAgo(10));
    for (const [speaker, grammar] of [[ana, 11], [bruno, 91]] as const) {
      await seedProfileSource(
        ctx,
        lessonSourceInput({
          kind: 'lesson_analysis',
          userId: speaker.id,
          lessonId: shared,
          occurredAt: daysAgo(10),
          scores: { grammar },
          occurrences:
            speaker === bruno ? [{ tag: 'vocab:phrasal-verb', quote: 'bruno-only quote' }] : [],
        }),
      );
    }
    const brunoActivity = crypto.randomUUID();
    await ingestActivity(bruno.id, { occurredAt: daysAgo(1), grammar: 99, activityId: brunoActivity });
    const brunoEntry = await ctx.prisma.errorLedgerEntry.findFirstOrThrow({ where: { userId: bruno.id } });

    const response = await get('/progress', ana);

    expect(response.status).toBe(200);
    const body = JSON.stringify(response.body);
    expect(body).not.toContain(bruno.id);
    expect(body).not.toContain(brunoActivity);
    expect(body).not.toContain(brunoEntry.id);
    expect(body).not.toContain('vocab:phrasal-verb');
    expect(body).not.toContain('bruno-only quote');
    const points = response.body.data.competencyHistory.series[0].points;
    expect(points).toEqual([expect.objectContaining({ score: 11, lessonId: shared })]);
  });

  it('requires_authentication', async () => {
    const response = await get('/progress');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH003');
  });
});
