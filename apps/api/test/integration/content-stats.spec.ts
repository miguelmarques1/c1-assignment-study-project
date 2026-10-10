import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient, type Prisma } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  collectActivityStats,
  collectContentStats,
  relativeTime,
  renderActivityStats,
  renderContentStats,
} from '../../src/content/content-stats';
import { FIXTURE_TAGS, fiveQuestions, fixtureTaxonomy } from './helpers/content-fixtures';
import { applyMigrations } from './helpers/test-app';

const taxonomy = fixtureTaxonomy();
const DAY_MS = 24 * 60 * 60 * 1000;

let postgres: StartedPostgreSqlContainer;
let prisma: PrismaClient;

interface SeedOptions {
  type?: 'listening' | 'reading' | 'vocabulary' | 'grammar' | 'error_review';
  provenance?: 'curated' | 'generated';
  cefrLevel?: string;
  difficulty?: number;
  accent?: string;
  targetTags?: string[];
}

/** A row satisfying every CHECK for its type and provenance, straight through Prisma. */
async function seed(slug: string, options: SeedOptions = {}): Promise<string> {
  const type = options.type ?? 'reading';
  const provenance = options.provenance ?? (type === 'error_review' ? 'generated' : 'curated');
  const listening = type === 'listening';
  const data: Prisma.ContentItemCreateInput = {
    slug,
    type,
    provenance,
    cefrLevel: options.cefrLevel ?? 'C1',
    title: slug,
    topic: 'topic',
    skills: [type === 'error_review' ? 'grammar' : type],
    difficulty: options.difficulty ?? 4,
    body: 'Some body text.',
    wordCount: 3,
    questions: fiveQuestions() as Prisma.InputJsonValue,
    targetTags: options.targetTags ?? [FIXTURE_TAGS.grammar],
    ...(provenance === 'curated'
      ? { sourceName: 'Source' }
      : { promptId: 'reading-generate', promptVersion: '1', gateMetrics: { word_count: 500 } }),
    ...(listening
      ? {
          accent: options.accent ?? 'british',
          durationSeconds: 300,
          mediaObjectKey: `content/listening/${slug}/audio.mp3`,
          mediaChecksum: 'a'.repeat(64),
          mediaBytes: 2_000_000,
        }
      : {}),
  };
  return (await prisma.contentItem.create({ data, select: { id: true } })).id;
}

async function user(email: string): Promise<string> {
  return (await prisma.user.create({ data: { email, displayName: email, passwordHash: 'x'.repeat(60) } })).id;
}

beforeAll(async () => {
  postgres = await new PostgreSqlContainer('postgres:16-alpine').start();
  const databaseUrl = `${postgres.getConnectionUri()}?schema=public`;
  await applyMigrations(databaseUrl);
  prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect().catch(() => undefined);
  await postgres?.stop().catch(() => undefined);
});

beforeEach(async () => {
  await prisma.contentItemServing.deleteMany();
  await prisma.objectiveAttempt.deleteMany();
  await prisma.studyPlanActivity.deleteMany();
  await prisma.studyPlan.deleteMany();
  await prisma.contentItem.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.user.deleteMany();
});

interface AttemptSeed {
  itemId: string;
  userId: string;
  promptId?: string;
  promptVersion?: string;
  rating?: 'too_easy' | 'just_right' | 'too_hard' | null;
  notUseful?: boolean;
  ratedAt?: Date;
  unscored?: Array<{ index: number; reason: 'answer_key_invalid' | 'format_unavailable' }>;
}

/** A graded attempt on its own plan activity, as F16 leaves it. */
async function attempt(options: AttemptSeed): Promise<void> {
  const now = new Date();
  const lesson = await prisma.lesson.create({
    data: {
      room: 'classroom-main',
      openedBy: options.userId,
      maxParticipants: 2,
      status: 'ended',
      startedAt: now,
      endedAt: now,
      endReason: 'ended_by_participant',
      durationSeconds: 60,
      recordingStatus: 'recorded',
    },
  });
  const plan = await prisma.studyPlan.create({
    data: {
      userId: options.userId,
      lessonId: lesson.id,
      origin: 'lesson',
      status: 'archived',
      precedenceAt: now,
      composition: 'deterministic',
      deterministicReason: 'no_profile',
      generalMaterial: true,
      rulesVersion: '1',
      rulesFingerprint: 'f'.repeat(64),
      taxonomyVersion: '1',
      createdAt: now,
      activatedAt: now,
      archivedAt: now,
    },
  });
  const activity = await prisma.studyPlanActivity.create({
    data: {
      planId: plan.id,
      userId: options.userId,
      day: 1,
      position: 1,
      kind: 'reading',
      contentItemId: options.itemId,
      title: 'Reading',
      targetTags: [FIXTURE_TAGS.grammar],
      estimatedMinutes: 7,
      rationale: 'x',
      rationaleSource: 'template',
      placement: 'model',
      state: 'completed',
      startedAt: now,
      completedAt: now,
    },
  });
  const unscored = options.unscored ?? [];
  const results = [0, 1, 2, 3, 4].map((index) => {
    const flagged = unscored.find((entry) => entry.index === index);
    return flagged
      ? { index, outcome: 'unscored', unscoredReason: flagged.reason, issues: [] }
      : { index, outcome: 'correct', unscoredReason: null, issues: [] };
  });
  await prisma.objectiveAttempt.create({
    data: {
      userId: options.userId,
      planActivityId: activity.id,
      contentItemId: options.itemId,
      kind: 'reading',
      status: 'submitted',
      provenance: options.promptId ? 'generated' : 'curated',
      promptId: options.promptId ?? null,
      promptVersion: options.promptVersion ?? null,
      questions: [],
      questionsFingerprint: 'a'.repeat(64),
      submittedAt: now,
      answers: [],
      results,
      scoreCorrect: 5 - unscored.length,
      scoreTotal: 5 - unscored.length || 1,
      unscoredCount: unscored.length,
      timeSpentSeconds: 60,
      difficultyRating: options.rating ?? null,
      notUseful: options.notUseful ?? false,
      ratedAt: options.rating || options.notUseful ? (options.ratedAt ?? now) : null,
    },
  });
}

describe('content:stats', () => {
  it('reports_inventory_by_type_provenance_level_difficulty_and_accent', async () => {
    await seed('l1', { type: 'listening', accent: 'british', difficulty: 3, cefrLevel: 'B2' });
    await seed('l2', { type: 'listening', accent: 'american', difficulty: 4 });
    await seed('l3', { type: 'listening', accent: 'british', difficulty: 4 });
    await seed('r1', { type: 'reading', difficulty: 5, cefrLevel: 'C2' });
    await seed('r2', { type: 'reading', provenance: 'generated' });
    await seed('e1', { type: 'error_review' });

    const stats = await collectContentStats(prisma, taxonomy);

    expect(stats.total).toBe(6);
    expect(stats.byTypeAndProvenance).toEqual([
      { type: 'listening', curated: 3, generated: 0 },
      { type: 'reading', curated: 1, generated: 1 },
      { type: 'error_review', curated: 0, generated: 1 },
    ]);
    expect(stats.byCefrLevel).toEqual([
      { level: 'B2', count: 1 },
      { level: 'C1', count: 4 },
      { level: 'C2', count: 1 },
    ]);
    expect(stats.byDifficulty).toEqual([
      { difficulty: 3, count: 1 },
      { difficulty: 4, count: 4 },
      { difficulty: 5, count: 1 },
    ]);
    expect(stats.byAccent).toEqual([
      { accent: 'american', count: 1 },
      { accent: 'british', count: 2 },
    ]);
    expect(stats.media).toEqual({ objects: 3, bytes: 6_000_000 });

    const lines = renderContentStats(stats);
    expect(lines[0]).toBe('Content bank: 6 items');
    expect(lines).toContain('  listening           3          0      3');
    expect(lines).toContain('  By accent (listening): american: 1 · british: 2');
    expect(lines).toContain('  Stored media: 3 objects, 6.0 MB');
  });

  it('evaluates_the_listening_corpus_target', async () => {
    const accents = ['british', 'american', 'irish'];
    for (let index = 0; index < 19; index += 1) {
      await seed(`listening-${index}`, { type: 'listening', accent: accents[index % 3], difficulty: 3 + (index % 3) });
    }

    const short = await collectContentStats(prisma, taxonomy);
    expect(short.corpusTarget.map((check) => check.met)).toEqual([false, true, true]);
    expect(short.corpusTarget[0]!.line).toBe('19 listening items (target: at least 20)');

    await seed('listening-19', { type: 'listening', accent: 'british', difficulty: 5 });
    const met = await collectContentStats(prisma, taxonomy);
    expect(met.corpusTarget.map((check) => check.met)).toEqual([true, true, true]);
    expect(renderContentStats(met)).toEqual(
      expect.arrayContaining([
        '  ✓ 20 listening items (target: at least 20)',
        '  ✓ 3 distinct accents: american, british, irish (target: at least 3)',
        '  ✓ listening at difficulty 3, 4 and 5 (target: at least one at each)',
      ]),
    );

    await prisma.contentItem.deleteMany({ where: { difficulty: 5 } });
    const gap = await collectContentStats(prisma, taxonomy);
    expect(gap.corpusTarget[2]).toEqual({
      met: false,
      line: 'no listening item at difficulty 5 (target: at least one at each of 3, 4 and 5)',
    });
  });

  it('reports_serve_counts_distinct_users_and_never_served_items', async () => {
    const [a, b] = [await user('a@example.com'), await user('b@example.com')];
    const popular = await seed('popular');
    const once = await seed('served-once');
    await seed('never-1');
    await seed('never-2');
    const now = Date.now();
    await prisma.contentItemServing.createMany({
      data: [
        { userId: a, contentItemId: popular, servedAt: new Date(now - 40 * DAY_MS) },
        { userId: a, contentItemId: popular, servedAt: new Date(now - 3 * DAY_MS) },
        { userId: b, contentItemId: popular, servedAt: new Date(now - 2 * DAY_MS) },
        { userId: b, contentItemId: once, servedAt: new Date(now - 5 * 60 * 60 * 1000) },
      ],
    });

    const stats = await collectContentStats(prisma, taxonomy);

    expect(stats.served.map(({ slug, servings, distinctUsers }) => ({ slug, servings, distinctUsers }))).toEqual([
      { slug: 'popular', servings: 3, distinctUsers: 2 },
      { slug: 'served-once', servings: 1, distinctUsers: 1 },
    ]);
    expect(Math.abs(stats.served[0]!.lastServedAt.getTime() - (now - 2 * DAY_MS))).toBeLessThan(1000);
    expect(stats.neverServed).toEqual(['never-1', 'never-2']);

    const lines = renderContentStats(stats, new Date(now));
    expect(lines).toContain('  popular      reading       3      2  2 days ago');
    expect(lines).toContain('  Never served (2): never-1, never-2');
    expect(relativeTime(new Date(now - 90 * 1000), new Date(now))).toBe('1 minute ago');
    expect(relativeTime(new Date(now), new Date(now))).toBe('just now');
  });

  it('lists_items_whose_tags_left_the_taxonomy', async () => {
    await seed('current-tags', { targetTags: [FIXTURE_TAGS.grammar, FIXTURE_TAGS.vocab] });
    await seed('retired-curated', { targetTags: [FIXTURE_TAGS.grammar, 'vocab:retired-tag'] });
    await seed('retired-generated', { provenance: 'generated', targetTags: ['grammar:gone'] });

    const stats = await collectContentStats(prisma, taxonomy);

    expect(stats.taxonomyDrift).toEqual([
      { slug: 'retired-curated', provenance: 'curated', tags: ['vocab:retired-tag'] },
      { slug: 'retired-generated', provenance: 'generated', tags: ['grammar:gone'] },
    ]);
    const lines = renderContentStats(stats);
    expect(lines).toContain('Taxonomy drift (tags not in error taxonomy vfixture-1)');
    expect(lines).toContain('  retired-curated (curated): vocab:retired-tag');

    await prisma.contentItem.deleteMany({ where: { slug: { startsWith: 'retired' } } });
    const clean = renderContentStats(await collectContentStats(prisma, taxonomy));
    expect(clean.some((line) => line.startsWith('Taxonomy drift'))).toBe(false);
  });

  describe('activity signals (F16)', () => {
    const since = new Date(Date.now() - 90 * DAY_MS);

    it('reports_ratings_per_prompt_version_and_a_curated_row', async () => {
      const generated = await seed('gen-reading', { provenance: 'generated' });
      const curated = await seed('cur-reading');
      const userId = await user('rater@example.com');
      const stamp = { promptId: 'reading-generate', promptVersion: '3' };
      await attempt({ itemId: generated, userId, ...stamp, rating: 'too_easy' });
      await attempt({ itemId: generated, userId, ...stamp, rating: 'just_right' });
      await attempt({ itemId: generated, userId, ...stamp, rating: 'too_hard', notUseful: true });
      await attempt({ itemId: curated, userId, rating: 'just_right' });
      await attempt({ itemId: curated, userId, rating: 'too_hard', ratedAt: new Date(Date.now() - 120 * DAY_MS) });

      const stats = await collectActivityStats(prisma, since);

      expect(stats.ratings).toEqual([
        { source: 'curated', rated: 1, tooEasy: 0, justRight: 1, tooHard: 0, notUseful: 0 },
        { source: 'reading-generate@3', rated: 3, tooEasy: 1, justRight: 1, tooHard: 1, notUseful: 1 },
      ]);
      const lines = renderActivityStats(stats, 90);
      expect(lines).toContain('Difficulty ratings by prompt version (last 90 days)');
      expect(lines.some((line) => line.includes('reading-generate@3') && line.includes('33%'))).toBe(true);
    });

    it('lists_items_with_questions_that_could_not_be_corrected', async () => {
      const broken = await seed('broken-key');
      const fine = await seed('fine-key');
      const userId = await user('flagged@example.com');
      await attempt({ itemId: broken, userId, unscored: [{ index: 2, reason: 'answer_key_invalid' }] });
      await attempt({
        itemId: broken,
        userId,
        unscored: [
          { index: 2, reason: 'answer_key_invalid' },
          { index: 0, reason: 'answer_key_invalid' },
        ],
      });
      await attempt({ itemId: fine, userId });

      const stats = await collectActivityStats(prisma, since);

      expect(stats.uncorrectable).toEqual([{ slug: 'broken-key', questions: [1, 3], attempts: 2, lastSeen: expect.any(Date) }]);
      const text = renderActivityStats(stats, 90).join(String.fromCharCode(10));
      expect(text).toContain('Questions that could not be corrected (last 90 days)');
      expect(text).toContain('broken-key');
      expect(text).not.toContain('fine-key');
    });

    it('counts_questions_waiting_for_the_full_scope_separately', async () => {
      const ordered = await seed('has-ordering');
      const userId = await user('ordering@example.com');
      await attempt({ itemId: ordered, userId, unscored: [{ index: 4, reason: 'format_unavailable' }] });

      const stats = await collectActivityStats(prisma, since);

      expect(stats.uncorrectable).toEqual([]);
      expect(stats.waitingForFullScope).toEqual({ items: 1, questions: 1 });
      const lines = renderActivityStats(stats, 90);
      expect(lines).toContain('  None. Every answer key was valid when it was used.');
      expect(lines.some((line) => line.includes('1 ordering or matching question in 1 item waiting for F16 Full'))).toBe(true);
    });
  });
});
