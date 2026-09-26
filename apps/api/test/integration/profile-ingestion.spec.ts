import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Logger } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse, stringify } from 'yaml';

import { ErrorLedgerReader } from '../../src/profile/error-ledger.reader';
import { LearningProfileReader } from '../../src/profile/learning-profile.reader';
import type { ActivityOutcomeInput } from '../../src/profile/profile-ingestion.contract';
import { ProfileIngestionService } from '../../src/profile/profile-ingestion.service';
import { DAY_MS } from '../../src/profile/profile.constants';
import { ERROR_TAXONOMY_PATH } from '../../src/taxonomy/error-taxonomy.constants';
import { ErrorTaxonomyService } from '../../src/taxonomy/error-taxonomy.service';
import {
  lessonSourceInput,
  makeProfiledLesson,
  seedLesson,
  seedProfileSource,
  seedUser,
} from './helpers/pipeline-fixtures';
import { createTestContext, type TestContext } from './helpers/test-app';

let ctx: TestContext;
let ingestion: ProfileIngestionService;
let profiles: LearningProfileReader;
let ledger: ErrorLedgerReader;

const tempDir = mkdtempSync(join(tmpdir(), 'f12-taxonomy-'));

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

function activityOutcome(userId: string, overrides: Partial<ActivityOutcomeInput> = {}): ActivityOutcomeInput {
  return {
    userId,
    activityId: crypto.randomUUID(),
    sourceKey: crypto.randomUUID(),
    activityType: 'grammar',
    occurredAt: new Date(),
    measurements: [],
    errorOccurrences: [],
    correctEncounters: [],
    ...overrides,
  };
}

async function competency(userId: string, name: string) {
  return ctx.prisma.profileCompetency.findUnique({ where: { userId_competency: { userId, competency: name } } });
}

async function rowCounts(userId: string) {
  const [sources, measurements, competencies, entries, occurrences, encounters] = await Promise.all([
    ctx.prisma.profileSource.count({ where: { userId } }),
    ctx.prisma.profileMeasurement.count({ where: { userId } }),
    ctx.prisma.profileCompetency.count({ where: { userId } }),
    ctx.prisma.errorLedgerEntry.count({ where: { userId } }),
    ctx.prisma.errorLedgerOccurrence.count({ where: { userId } }),
    ctx.prisma.errorLedgerEncounter.count({ where: { userId } }),
  ]);
  return { sources, measurements, competencies, entries, occurrences, encounters };
}

beforeAll(async () => {
  ctx = await createTestContext();
  ingestion = ctx.app.get(ProfileIngestionService);
  profiles = ctx.app.get(LearningProfileReader);
  ledger = ctx.app.get(ErrorLedgerReader);
});

afterAll(async () => {
  await ctx?.close();
  rmSync(tempDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await ctx.prisma.lesson.deleteMany();
  await ctx.prisma.user.deleteMany();
});

afterEach(() => {
  vi.restoreAllMocks();
  ctx.app.get(ErrorTaxonomyService).load();
});

describe('profile ingestion', () => {
  it('six_competencies_come_from_their_own_sources', async () => {
    const userId = await seedUser(ctx, 'Ana');
    await makeProfiledLesson(ctx, userId, {
      startedAt: daysAgo(1),
      pronunciation: { value: 72, accuracy: 81, prosody: 66 },
      scores: { grammar: 68, vocabulary: 74, fluency: 71, interaction: 77, comprehension: 80 },
    });

    const snapshot = await profiles.snapshotFor(userId);
    expect(snapshot.competencies.map((entry) => [entry.competency, entry.score])).toEqual([
      ['grammar', 68],
      ['vocabulary', 74],
      ['fluency', 71],
      ['interaction', 77],
      ['comprehension', 80],
      ['pronunciation', 72],
    ]);
    expect(snapshot.competencies[5]).toMatchObject({ accuracy: 81, prosody: 66 });

    const measurements = await ctx.prisma.profileMeasurement.findMany({
      where: { userId },
      include: { source: { select: { kind: true } } },
    });
    expect(measurements).toHaveLength(6);
    for (const row of measurements) {
      expect(row.weight).toBeCloseTo(0.35, 5);
      expect(row.sourceKind).toBe('lesson');
      expect(row.source.kind).toBe(row.competency === 'pronunciation' ? 'lesson_pronunciation' : 'lesson_analysis');
    }
  });

  it('a_lesson_moves_scores_at_0_35_and_an_activity_at_0_15', async () => {
    const userId = await seedUser(ctx, 'Ana');
    await makeProfiledLesson(ctx, userId, { startedAt: daysAgo(3), scores: { grammar: 70 } });
    await makeProfiledLesson(ctx, userId, { startedAt: daysAgo(2), scores: { grammar: 90 } });
    expect((await competency(userId, 'grammar'))!.score).toBeCloseTo(77, 3);

    await ingestion.ingestActivityOutcome(
      activityOutcome(userId, { occurredAt: daysAgo(1), measurements: [{ competency: 'grammar', value: 60 }] }),
    );

    const grammar = (await competency(userId, 'grammar'))!;
    expect(grammar.score).toBeCloseTo(0.85 * 77 + 0.15 * 60, 3);
    expect(grammar.previousScore).toBeCloseTo(77, 3);
    expect(grammar.measurementCount).toBe(3);
    expect(grammar.trend).toBe('up');

    const history = await profiles.measurementHistory(userId, { competency: 'grammar' });
    expect(history.map((point) => point.sourceKind)).toEqual(['lesson', 'lesson', 'activity']);
    expect(history.map((point) => point.scoreAfter)).toEqual([
      expect.closeTo(70, 3),
      expect.closeTo(77, 3),
      expect.closeTo(74.45, 3),
    ]);
    const activityRow = await ctx.prisma.profileMeasurement.findFirst({ where: { userId, sourceKind: 'activity' } });
    expect(activityRow!.weight).toBeCloseTo(0.15, 5);
  });

  it('each_tag_has_one_record_with_counts_seen_sources_and_examples', async () => {
    const userId = await seedUser(ctx, 'Ana');
    const tag = 'grammar:conditional-3';
    const first = await makeProfiledLesson(ctx, userId, {
      startedAt: daysAgo(10),
      errors: [1, 2, 3, 4].map((n) => ({ tag, quote: `old quote ${n}`, correction: `fix ${n}`, severity: 'moderate' as const })),
    });
    const second = await makeProfiledLesson(ctx, userId, {
      startedAt: daysAgo(5),
      errors: [{ tag, quote: 'if I would have known', correction: 'if I had known', severity: 'major' }],
    });
    const activityId = crypto.randomUUID();
    await ingestion.ingestActivityOutcome(
      activityOutcome(userId, {
        activityId,
        occurredAt: daysAgo(1),
        errorOccurrences: [{ tag, quote: 'If she would have called, I would have come.' }],
      }),
    );

    const entries = await ctx.prisma.errorLedgerEntry.findMany({ where: { userId } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ tag, occurrenceCount: 6, label: 'Third conditional', family: 'grammar' });
    expect(entries[0]!.firstSeenAt.getTime()).toBeCloseTo(daysAgo(10).getTime(), -4);
    expect(entries[0]!.lastSeenAt.getTime()).toBeCloseTo(daysAgo(1).getTime(), -4);

    const detail = (await ledger.detailFor(userId, entries[0]!.id))!;
    expect(detail.examples).toHaveLength(5);
    expect(detail.examples[0]).toMatchObject({ sourceKind: 'activity', activityId, lessonId: null });
    expect(detail.examples[1]).toMatchObject({ sourceKind: 'lesson', lessonId: second, quote: 'if I would have known' });
    expect(detail.examples.map((example) => example.occurredAt.getTime())).toEqual(
      [...detail.examples.map((example) => example.occurredAt.getTime())].sort((a, b) => b - a),
    );
    expect(detail.sources).toEqual([
      expect.objectContaining({ sourceKind: 'activity', activityId, occurrences: 1 }),
      expect.objectContaining({ sourceKind: 'lesson', lessonId: second, occurrences: 1 }),
      expect.objectContaining({ sourceKind: 'lesson', lessonId: first, occurrences: 4 }),
    ]);
  });

  it('reapplying_the_same_revision_changes_nothing', async () => {
    const userId = await seedUser(ctx, 'Ana');
    const lessonId = await seedLesson(ctx, [userId], daysAgo(1));
    const source = lessonSourceInput({
      kind: 'lesson_analysis',
      userId,
      lessonId,
      occurredAt: daysAgo(1),
      scores: { grammar: 60, vocabulary: 70, fluency: 80, interaction: 75, comprehension: 85 },
      occurrences: [{ tag: 'grammar:past-simple', quote: 'I goed there' }],
    });
    expect((await seedProfileSource(ctx, source)).outcome).toBe('ingested');
    const counts = await rowCounts(userId);
    const before = await profiles.snapshotFor(userId);
    const entryBefore = await ctx.prisma.errorLedgerEntry.findFirst({ where: { userId } });

    expect(await seedProfileSource(ctx, source)).toEqual({ outcome: 'skipped', rejectedTags: [] });

    expect(await rowCounts(userId)).toEqual(counts);
    expect((await profiles.snapshotFor(userId)).competencies).toEqual(before.competencies);
    expect(await ctx.prisma.errorLedgerEntry.findFirst({ where: { userId } })).toEqual(entryBefore);
  });

  it('a_new_revision_replaces_the_source', async () => {
    const userId = await seedUser(ctx, 'Ana');
    const lessonId = await seedLesson(ctx, [userId], daysAgo(1));
    const base = { kind: 'lesson_analysis' as const, userId, lessonId, occurredAt: daysAgo(1) };
    await seedProfileSource(
      ctx,
      lessonSourceInput({
        ...base,
        revision: 'analysis-a',
        scores: { grammar: 40 },
        occurrences: [1, 2, 3].map((n) => ({ tag: 'grammar:past-simple', quote: `old ${n}` })),
      }),
    );

    const result = await seedProfileSource(
      ctx,
      lessonSourceInput({
        ...base,
        revision: 'analysis-b',
        scores: { grammar: 80 },
        occurrences: [{ tag: 'vocab:collocation', quote: 'make a photo' }],
      }),
    );

    expect(result.outcome).toBe('replaced');
    expect(await ctx.prisma.profileSource.findMany({ where: { userId } })).toEqual([
      expect.objectContaining({ revision: 'analysis-b', occurrenceCount: 1 }),
    ]);
    expect(await ctx.prisma.errorLedgerEntry.findMany({ where: { userId }, select: { tag: true, occurrenceCount: true } })).toEqual([
      { tag: 'vocab:collocation', occurrenceCount: 1 },
    ]);
    expect(await ctx.prisma.errorLedgerOccurrence.count({ where: { userId, tag: 'grammar:past-simple' } })).toBe(0);
    expect(await competency(userId, 'grammar')).toMatchObject({ score: 80, measurementCount: 1, previousScore: null });
  });

  it('unknown_tags_are_rejected_and_logged_while_known_ones_are_ingested', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn');
    const userId = await seedUser(ctx, 'Ana');
    const lessonId = await seedLesson(ctx, [userId], daysAgo(1));

    const result = await seedProfileSource(
      ctx,
      lessonSourceInput({
        kind: 'lesson_analysis',
        userId,
        lessonId,
        occurredAt: daysAgo(1),
        scores: { grammar: 70 },
        occurrences: [
          { tag: 'grammar:made-up-tag', quote: 'a secret sentence nobody should log' },
          { tag: 'grammar:conditional-3', quote: 'if I would have known' },
          { tag: 'vocab:collocation', quote: 'make a photo' },
        ],
      }),
    );

    expect(result).toEqual({ outcome: 'ingested', rejectedTags: ['grammar:made-up-tag'] });
    const source = await ctx.prisma.profileSource.findFirstOrThrow({ where: { userId } });
    expect(source.rejectedTags).toEqual(['grammar:made-up-tag']);
    expect(source.occurrenceCount).toBe(2);
    expect((await ctx.prisma.errorLedgerEntry.findMany({ where: { userId } })).map((entry) => entry.tag).sort()).toEqual([
      'grammar:conditional-3',
      'vocab:collocation',
    ]);

    const logged = warn.mock.calls.map((call) => String(call[0])).filter((line) => line.includes('grammar:made-up-tag'));
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain(userId);
    expect(logged[0]).not.toContain('secret sentence');
  });

  it('concurrent_lesson_and_activity_updates_are_serialized', async () => {
    const userId = await seedUser(ctx, 'Ana');
    await makeProfiledLesson(ctx, userId, { startedAt: daysAgo(5), scores: { grammar: 50 } });
    const lessonId = await seedLesson(ctx, [userId], daysAgo(2));

    // The lesson holds the per-user lock for a while; the activity has to wait for its commit.
    const lesson = ctx.prisma.$transaction(
      async (tx) => {
        await ingestion.applySource(
          tx,
          lessonSourceInput({ kind: 'lesson_analysis', userId, lessonId, occurredAt: daysAgo(2), scores: { grammar: 90 } }),
        );
        await new Promise((resolve) => setTimeout(resolve, 400));
      },
      { timeout: 10_000 },
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    const activity = ingestion.ingestActivityOutcome(
      activityOutcome(userId, { occurredAt: daysAgo(1), measurements: [{ competency: 'grammar', value: 30 }] }),
    );
    await Promise.all([lesson, activity]);

    const expected = 0.85 * (0.65 * 50 + 0.35 * 90) + 0.15 * 30;
    const grammar = (await competency(userId, 'grammar'))!;
    expect(grammar.score).toBeCloseTo(expected, 3);
    expect(grammar.measurementCount).toBe(3);
    expect(await ctx.prisma.profileSource.count({ where: { userId, kind: { in: ['lesson_analysis', 'activity'] } } })).toBe(3);
  });

  it('activity_outcomes_update_scores_and_ledger_synchronously', async () => {
    const userId = await seedUser(ctx, 'Ana');
    const started = Date.now();

    const result = await ingestion.ingestActivityOutcome(
      activityOutcome(userId, {
        measurements: [{ competency: 'grammar', value: 60 }],
        errorOccurrences: [{ tag: 'grammar:conditional-3', quote: 'If she would have called, I would have come.' }],
      }),
    );

    expect(Date.now() - started).toBeLessThan(5_000);
    expect(result).toEqual({ outcome: 'ingested', rejectedTags: [] });
    const snapshot = await profiles.snapshotFor(userId);
    expect(snapshot.competencies[0]).toMatchObject({ competency: 'grammar', score: 60, measurementCount: 1 });
    expect(snapshot.updatedAt).not.toBeNull();
    expect(await ledger.entriesFor(userId)).toEqual([
      expect.objectContaining({ tag: 'grammar:conditional-3', occurrenceCount: 1, state: 'practicing' }),
    ]);
  });

  it('an_activity_joins_the_callers_transaction', async () => {
    const userId = await seedUser(ctx, 'Ana');

    await expect(
      ctx.prisma.$transaction(async (tx) => {
        await ingestion.ingestActivityOutcome(
          activityOutcome(userId, {
            measurements: [{ competency: 'grammar', value: 60 }],
            errorOccurrences: [{ tag: 'grammar:conditional-3' }],
          }),
          tx,
        );
        throw new Error('the attempt failed to save');
      }),
    ).rejects.toThrow('the attempt failed to save');

    expect(await rowCounts(userId)).toEqual({
      sources: 0,
      measurements: 0,
      competencies: 0,
      entries: 0,
      occurrences: 0,
      encounters: 0,
    });
    expect(await ctx.prisma.learningProfile.count({ where: { userId } })).toBe(0);
  });

  it('a_duplicate_activity_submission_writes_nothing_twice', async () => {
    const userId = await seedUser(ctx, 'Ana');
    const outcome = activityOutcome(userId, {
      measurements: [{ competency: 'vocabulary', value: 55 }],
      errorOccurrences: [{ tag: 'vocab:collocation', quote: 'make a photo' }],
    });

    expect((await ingestion.ingestActivityOutcome(outcome)).outcome).toBe('ingested');
    const counts = await rowCounts(userId);
    expect((await ingestion.ingestActivityOutcome(outcome)).outcome).toBe('skipped');

    expect(await rowCounts(userId)).toEqual(counts);
    expect(await ctx.prisma.errorLedgerEntry.findFirst({ where: { userId } })).toMatchObject({ occurrenceCount: 1 });
  });

  it('correct_encounters_are_recorded_and_move_a_tag_to_practicing', async () => {
    const userId = await seedUser(ctx, 'Ana');
    const tag = 'grammar:past-perfect';
    await makeProfiledLesson(ctx, userId, { startedAt: daysAgo(6), errors: [{ tag, quote: 'I have went' }] });
    expect(await ctx.prisma.errorLedgerEntry.findFirst({ where: { userId, tag } })).toMatchObject({ state: 'new' });

    for (const days of [5, 4, 3, 2, 1]) {
      await ingestion.ingestActivityOutcome(
        activityOutcome(userId, {
          occurredAt: daysAgo(days),
          correctEncounters: [{ tag }, { tag: 'vocab:register' }],
        }),
      );
    }

    expect(await ctx.prisma.errorLedgerEncounter.count({ where: { userId, tag } })).toBe(5);
    const entry = await ctx.prisma.errorLedgerEntry.findFirstOrThrow({ where: { userId, tag } });
    expect(entry).toMatchObject({ state: 'practicing', dueAt: null, occurrenceCount: 1 });
    // An encounter on a tag with no occurrence records the evidence but creates no record.
    expect(await ctx.prisma.errorLedgerEncounter.count({ where: { userId, tag: 'vocab:register' } })).toBe(5);
    expect(await ctx.prisma.errorLedgerEntry.count({ where: { userId, tag: 'vocab:register' } })).toBe(0);
    expect(await ledger.dueEntries(userId)).toEqual([]);
  });

  it('activity_phoneme_tags_join_the_lesson_ledger_record', async () => {
    const userId = await seedUser(ctx, 'Ana');
    const tag = 'phoneme:/θ/';
    const lessonId = await makeProfiledLesson(ctx, userId, {
      startedAt: daysAgo(3),
      pronunciation: { value: 70, accuracy: 75, prosody: 60 },
      phonemes: [{ tag, exampleWords: ['think', 'three'], instances: 4 }],
    });
    const activityId = crypto.randomUUID();
    await ingestion.ingestActivityOutcome(
      activityOutcome(userId, {
        activityId,
        activityType: 'speaking',
        measurements: [{ competency: 'pronunciation', value: 65, accuracy: 70, prosody: null }],
        errorOccurrences: [{ tag, exampleWords: ['thought'], instances: 2 }],
      }),
    );

    const entries = await ctx.prisma.errorLedgerEntry.findMany({ where: { userId } });
    expect(entries).toEqual([expect.objectContaining({ tag, family: 'phoneme', occurrenceCount: 2, label: '/θ/ as in "think"' })]);
    const detail = (await ledger.detailFor(userId, entries[0]!.id))!;
    expect(detail.sources.map((source) => source.lessonId ?? source.activityId)).toEqual([activityId, lessonId]);
    expect(detail.examples[1]).toMatchObject({ exampleWords: ['think', 'three'], instances: 4, quote: null });
  });

  it('a_retired_tag_keeps_its_record_as_history', async () => {
    const userId = await seedUser(ctx, 'Ana');
    const tag = 'grammar:conditional-3';
    await makeProfiledLesson(ctx, userId, {
      startedAt: daysAgo(2),
      errors: [1, 2, 3].map((n) => ({ tag, quote: `quote ${n}` })),
    });
    expect((await ledger.recurringFor(userId)).map((entry) => entry.tag)).toEqual([tag]);

    // A later taxonomy version without the tag.
    const current = parse(readFileSync(ERROR_TAXONOMY_PATH, 'utf-8')) as { version: string; tags: Array<{ tag: string }> };
    const without = { ...current, version: '99', tags: current.tags.filter((entry) => entry.tag !== tag) };
    const path = join(tempDir, 'without-conditional-3.yaml');
    writeFileSync(path, stringify(without));
    ctx.app.get(ErrorTaxonomyService).load(path);

    const [entry] = await ledger.entriesFor(userId);
    expect(entry).toMatchObject({ tag, retired: true, label: 'Third conditional', occurrenceCount: 3 });
    expect(await ledger.recurringFor(userId)).toEqual([]);
    expect(await ledger.unmasteredTags(userId)).toEqual([]);
    expect(await ctx.prisma.errorLedgerEntry.count({ where: { userId } })).toBe(1);

    // New evidence for the retired tag is rejected at ingestion; the record stays history.
    const result = await ingestion.ingestActivityOutcome(activityOutcome(userId, { errorOccurrences: [{ tag }] }));
    expect(result.rejectedTags).toEqual([tag]);
    expect(await ctx.prisma.errorLedgerEntry.findFirstOrThrow({ where: { userId } })).toMatchObject({ occurrenceCount: 3 });
  });

  it('another_users_data_is_never_touched', async () => {
    const ana = await seedUser(ctx, 'Ana');
    const bruno = await seedUser(ctx, 'Bruno');
    await makeProfiledLesson(ctx, ana, {
      startedAt: daysAgo(2),
      pronunciation: { value: 60, accuracy: 60, prosody: 60 },
      errors: [{ tag: 'grammar:past-simple', quote: 'Ana goed' }],
    });
    expect(await rowCounts(bruno)).toEqual({ sources: 0, measurements: 0, competencies: 0, entries: 0, occurrences: 0, encounters: 0 });
    const anaBefore = await rowCounts(ana);
    const anaSnapshot = await profiles.snapshotFor(ana);

    await makeProfiledLesson(ctx, bruno, {
      startedAt: daysAgo(1),
      scores: { grammar: 99 },
      errors: [{ tag: 'grammar:past-simple', quote: 'Bruno goed' }],
    });

    expect(await rowCounts(ana)).toEqual(anaBefore);
    expect((await profiles.snapshotFor(ana)).competencies).toEqual(anaSnapshot.competencies);
    expect(await ctx.prisma.errorLedgerEntry.findFirstOrThrow({ where: { userId: ana } })).toMatchObject({ occurrenceCount: 1 });
    expect((await ctx.prisma.errorLedgerOccurrence.findMany({ where: { userId: bruno } })).map((row) => row.quote)).toEqual([
      'Bruno goed',
    ]);
  });

  it('rebuild_matches_incremental_ingestion', async () => {
    const userId = await seedUser(ctx, 'Ana');
    await makeProfiledLesson(ctx, userId, {
      startedAt: daysAgo(9),
      scores: { grammar: 50, vocabulary: 60 },
      pronunciation: { value: 70, accuracy: 72, prosody: 61 },
      errors: [{ tag: 'grammar:past-simple', quote: 'a' }, { tag: 'vocab:collocation', quote: 'b' }],
      phonemes: [{ tag: 'phoneme:/θ/', exampleWords: ['think'] }],
    });
    const deleted = await makeProfiledLesson(ctx, userId, {
      startedAt: daysAgo(5),
      scores: { grammar: 90, vocabulary: 40 },
      pronunciation: { value: 80, accuracy: 85, prosody: null },
      errors: [{ tag: 'grammar:past-simple', quote: 'c' }, { tag: 'discourse:connector', quote: 'd' }],
    });
    await ingestion.ingestActivityOutcome(
      activityOutcome(userId, {
        occurredAt: daysAgo(2),
        measurements: [{ competency: 'grammar', value: 65 }],
        errorOccurrences: [{ tag: 'vocab:collocation', quote: 'e' }],
        correctEncounters: [{ tag: 'grammar:past-simple' }],
      }),
    );

    const stable = async () => ({
      competencies: (await profiles.snapshotFor(userId)).competencies,
      entries: (await ledger.entriesFor(userId)).map(({ id: _id, ...entry }) => entry),
      history: await profiles.measurementHistory(userId),
    });
    const incremental = await stable();
    await ingestion.rebuild(userId);
    expect(await stable()).toEqual(incremental);

    // A lesson removed by hand cascades its evidence away but leaves the materialized rows stale until a rebuild.
    await ctx.prisma.lesson.delete({ where: { id: deleted } });
    expect((await competency(userId, 'vocabulary'))!.measurementCount).toBe(2);
    await ingestion.rebuild(userId);

    expect(await competency(userId, 'vocabulary')).toMatchObject({ score: 60, measurementCount: 1 });
    expect((await competency(userId, 'grammar'))!.score).toBeCloseTo(0.85 * 50 + 0.15 * 65, 3);
    expect(await ctx.prisma.errorLedgerEntry.count({ where: { userId, tag: 'discourse:connector' } })).toBe(0);
    expect(await ctx.prisma.errorLedgerEntry.findFirstOrThrow({ where: { userId, tag: 'grammar:past-simple' } })).toMatchObject({
      occurrenceCount: 1,
      state: 'practicing',
    });
  });
});
