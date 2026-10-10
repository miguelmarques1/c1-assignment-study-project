import type { Prisma } from '@prisma/client';
import request from 'supertest';

import { resetEnvCache } from '../../../src/config/env';
import { StorageService } from '../../../src/storage/storage.service';
import { startMinio, TEST_MINIO_ACCESS_KEY, TEST_MINIO_BUCKET, TEST_MINIO_SECRET_KEY, type StartedMinio } from './minio';
import { createTestContext, type TestContext } from './test-app';

export interface ActivityTestContext {
  ctx: TestContext;
  minio: StartedMinio;
  storage: StorageService;
  close: () => Promise<void>;
}

/** The real API with MinIO behind `StorageService`, so listening audio streams from a real object store. */
export async function createActivityTestContext(): Promise<ActivityTestContext> {
  const minio = await startMinio();
  const storageEnv = {
    S3_ENDPOINT: minio.endpoint,
    S3_ACCESS_KEY: TEST_MINIO_ACCESS_KEY,
    S3_SECRET_KEY: TEST_MINIO_SECRET_KEY,
    S3_BUCKET: TEST_MINIO_BUCKET,
  };
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db?schema=public',
    REDIS_URL: 'redis://localhost:6379',
    SESSION_SECRET: 'a'.repeat(48),
    BYOK_MASTER_KEY: Buffer.alloc(32, 7).toString('base64'),
    LIVEKIT_URL: 'http://localhost:7880',
    LIVEKIT_WS_URL: 'ws://localhost:7880',
    LIVEKIT_API_KEY: 'devkey',
    LIVEKIT_API_SECRET: 'devsecret',
    ...storageEnv,
  });
  resetEnvCache();
  const storage = new StorageService();
  await storage.ensureBucket();

  const ctx = await createTestContext({ extraEnv: storageEnv, overrides: [{ token: StorageService, useValue: storage }] });
  // Listening once lets concurrent requests share the server instead of each supertest call binding (and then closing) its own.
  await ctx.app.listen(0);
  return {
    ctx,
    minio,
    storage,
    close: async () => {
      await ctx.close();
      await minio.stop();
    },
  };
}

export const GRAMMAR_TAG = 'grammar:conditional-3';
export const SECOND_GRAMMAR_TAG = 'grammar:conditional-2';

export const mcq = (overrides: Record<string, unknown> = {}) => ({
  format: 'multiple_choice',
  prompt: 'What does the writer blame for the collapse?',
  options: ['Rising interest rates', "The council's refusal to consult tenants", 'A shortage of builders', 'National housing policy'],
  answer: "The council's refusal to consult tenants",
  explanation: 'The second paragraph pins the collapse on the council.',
  ...overrides,
});

export const blank = (overrides: Record<string, unknown> = {}) => ({
  format: 'fill_blank',
  prompt: 'If the council ___ the tenants, the scheme would have survived.',
  answer: ['had listened to', 'had heard'],
  explanation: "A third conditional puts the past perfect in the if-clause: 'had listened to'.",
  ...overrides,
});

export const orderingQuestion = () => ({
  format: 'ordering',
  prompt: "Put the writer's arguments in the order they are made.",
  segments: ['First', 'Second', 'Third'],
  answer: [2, 0, 1],
  explanation: 'The order follows the paragraphs.',
});

/** Five questions the Core runner scores: multiple choice (answer index 1), fill, multiple choice, fill, multiple choice. */
export function coreQuestions(): Record<string, unknown>[] {
  return [
    mcq(),
    blank(),
    mcq({ prompt: 'Which word best describes the tone?', options: ['Detached', 'Exasperated', 'Celebratory', 'Nostalgic'], answer: 'Exasperated' }),
    blank({ prompt: '___ the tenants been heard, the vote would have gone differently.', answer: ['Had'] }),
    mcq({ prompt: 'Which title fits best?', options: ['A', 'B', 'C', 'D'], answer: 'B' }),
  ];
}

/** The answers that get `coreQuestions()` fully right. */
export const ALL_CORRECT_ANSWERS = [
  { index: 0, format: 'multiple_choice', optionIndex: 1 },
  { index: 1, format: 'fill_blank', text: 'had listened to' },
  { index: 2, format: 'multiple_choice', optionIndex: 1 },
  { index: 3, format: 'fill_blank', text: 'Had' },
  { index: 4, format: 'multiple_choice', optionIndex: 1 },
];

/** The same answers with question 2 (index 1) wrong. */
export const ONE_FILL_WRONG_ANSWERS = ALL_CORRECT_ANSWERS.map((answer) =>
  answer.index === 1 ? { ...answer, text: 'would have heard' } : answer,
);

export interface SeedItemOptions {
  type?: 'listening' | 'reading' | 'vocabulary' | 'grammar' | 'error_review';
  provenance?: 'curated' | 'generated';
  questions?: unknown[];
  targetTags?: string[];
  body?: string | null;
  mediaBytes?: number;
}

export interface SeededItem {
  id: string;
  slug: string;
  mediaObjectKey: string | null;
}

/** A content row satisfying every CHECK for its type and provenance, straight through Prisma. */
export async function seedItem(ctx: TestContext, slug: string, options: SeedItemOptions = {}): Promise<SeededItem> {
  const type = options.type ?? 'reading';
  const provenance = options.provenance ?? (type === 'error_review' ? 'generated' : 'curated');
  const listening = type === 'listening';
  const body = options.body === undefined ? 'Had the council listened to its own tenants, the scheme would not have collapsed.' : options.body;
  const mediaObjectKey = listening ? `content/listening/${slug}/audio.wav` : null;
  const data: Prisma.ContentItemCreateInput = {
    slug,
    type,
    provenance,
    cefrLevel: 'C1',
    title: `Item ${slug}`,
    topic: 'urban housing',
    skills: [type === 'error_review' ? 'grammar' : type],
    difficulty: 4,
    body,
    wordCount: body ? body.split(/\s+/).length : null,
    questions: (options.questions ?? coreQuestions()) as Prisma.InputJsonValue,
    targetTags: options.targetTags ?? [GRAMMAR_TAG],
    ...(provenance === 'curated'
      ? { sourceName: 'BBC Radio 4', sourceUrl: 'https://www.bbc.co.uk/programmes/example' }
      : { promptId: 'reading-generate', promptVersion: '3', gateMetrics: { word_count: 500 } }),
    ...(listening
      ? { accent: 'british', durationSeconds: 60, mediaObjectKey, mediaChecksum: 'a'.repeat(64), mediaBytes: options.mediaBytes ?? 1000 }
      : {}),
  };
  const row = await ctx.prisma.contentItem.create({ data, select: { id: true } });
  return { id: row.id, slug, mediaObjectKey };
}

export interface ActivitySpec {
  kind: 'listening' | 'reading' | 'vocabulary' | 'grammar' | 'error_review' | 'writing' | 'speaking' | 'pronunciation';
  contentItemId?: string | null;
  state?: 'pending' | 'in_progress' | 'completed' | 'skipped';
  targetTags?: string[];
  title?: string;
  carriedFromActivityId?: string;
  day?: number;
}

export interface SeededPlan {
  planId: string;
  /** Activity ids in the order given. */
  activityIds: string[];
}

/** One plan with the given activities on one day (positions 1..n). */
export async function seedPlan(
  ctx: TestContext,
  userId: string,
  lessonId: string,
  specs: ActivitySpec[],
  options: { status?: 'active' | 'archived'; origin?: 'lesson' | 'recording_failed' | 'analysis_blocked' } = {},
): Promise<SeededPlan> {
  const now = new Date();
  const status = options.status ?? 'active';
  const plan = await ctx.prisma.studyPlan.create({
    data: {
      userId,
      lessonId,
      origin: options.origin ?? 'lesson',
      status,
      precedenceAt: now,
      composition: 'deterministic',
      deterministicReason: 'no_profile',
      generalMaterial: true,
      focusTags: [],
      rulesVersion: '1',
      rulesFingerprint: 'f'.repeat(64),
      taxonomyVersion: '2',
      createdAt: now,
      activatedAt: status === 'active' ? now : null,
      archivedAt: status === 'archived' ? now : null,
    },
  });

  const activityIds: string[] = [];
  for (const [position, spec] of specs.entries()) {
    const state = spec.state ?? 'pending';
    const task = ['writing', 'speaking', 'pronunciation'].includes(spec.kind);
    const row = await ctx.prisma.studyPlanActivity.create({
      data: {
        planId: plan.id,
        userId,
        day: spec.day ?? 1,
        position: position + 1,
        kind: spec.kind,
        contentItemId: task ? null : (spec.contentItemId ?? null),
        title: spec.title ?? `${spec.kind} activity ${position + 1}`,
        targetTags: spec.targetTags ?? [GRAMMAR_TAG],
        estimatedMinutes: 7,
        rationale: 'Test fixture activity.',
        rationaleSource: 'template',
        placement: task ? 'task' : 'model',
        state,
        startedAt: state === 'pending' ? null : now,
        completedAt: state === 'completed' ? now : null,
        skippedAt: state === 'skipped' ? now : null,
        skipReason: state === 'skipped' ? 'test' : null,
        carriedFromActivityId: spec.carriedFromActivityId,
      },
    });
    activityIds.push(row.id);
  }
  return { planId: plan.id, activityIds };
}

/** Wipes everything these suites create, in dependency order. */
export async function resetActivityTables(ctx: TestContext): Promise<void> {
  await ctx.prisma.objectiveAttempt.deleteMany();
  await ctx.prisma.studyPlanActivity.deleteMany();
  await ctx.prisma.studyPlan.deleteMany();
  await ctx.prisma.profileSource.deleteMany();
  await ctx.prisma.errorLedgerEntry.deleteMany();
  await ctx.prisma.profileCompetency.deleteMany();
  await ctx.prisma.contentItem.deleteMany();
  await ctx.prisma.lesson.deleteMany();
  await ctx.prisma.user.deleteMany();
}

export interface Caller {
  cookie: string;
}

export function api(ctx: TestContext) {
  const server = ctx.app.getHttpServer();
  return {
    get: (path: string, caller?: Caller) => (caller ? request(server).get(path).set('Cookie', caller.cookie) : request(server).get(path)),
    post: (path: string, caller?: Caller) => (caller ? request(server).post(path).set('Cookie', caller.cookie) : request(server).post(path)),
    put: (path: string, caller?: Caller) => (caller ? request(server).put(path).set('Cookie', caller.cookie) : request(server).put(path)),
  };
}
