import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import ffmpegPath from 'ffmpeg-static';

import { resetEnvCache } from '../../../src/config/env';
import { SPEAKING_RETRY_DELAYS_OVERRIDE, SPEAKING_WORK_ROOT } from '../../../src/speaking/speaking.constants';
import { FastTranscriptionClient } from '../../../src/speech/fast-transcription.client';
import { PronunciationAssessmentClient } from '../../../src/speech/pronunciation-assessment.client';
import { StorageService } from '../../../src/storage/storage.service';
import { FakePronunciationAssessmentClient } from './fake-pronunciation';
import { FakeFastTranscriptionClient } from './fake-speech';
import { startMinio, TEST_MINIO_ACCESS_KEY, TEST_MINIO_BUCKET, TEST_MINIO_SECRET_KEY, type StartedMinio } from './minio';
import { createTestContext, type TestContext } from './test-app';

const execFileAsync = promisify(execFile);
const FFMPEG = ffmpegPath as unknown as string;

/** Two short inline retries instead of 2 s and 8 s. */
export const FAST_SPEAKING_RETRY_DELAYS = [10, 10];

export interface SpeakingTestContext {
  ctx: TestContext;
  minio: StartedMinio;
  storage: StorageService;
  speech: FakeFastTranscriptionClient;
  pronunciation: FakePronunciationAssessmentClient;
  workRoot: string;
  close: () => Promise<void>;
}

/** The real API with Azure faked at the client boundary and MinIO for audio — F18's own slice of `createPipelineTestContext`. */
export async function createSpeakingTestContext(): Promise<SpeakingTestContext> {
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

  const speech = new FakeFastTranscriptionClient();
  const pronunciation = new FakePronunciationAssessmentClient();
  const workRoot = await mkdtemp(join(tmpdir(), 'f18-work-root-'));

  const ctx = await createTestContext({
    extraEnv: storageEnv,
    overrides: [
      { token: StorageService, useValue: storage },
      { token: FastTranscriptionClient, useValue: speech },
      { token: PronunciationAssessmentClient, useValue: pronunciation },
      { token: SPEAKING_WORK_ROOT, useValue: workRoot },
      { token: SPEAKING_RETRY_DELAYS_OVERRIDE, useValue: FAST_SPEAKING_RETRY_DELAYS },
    ],
  });

  return {
    ctx,
    minio,
    storage,
    speech,
    pronunciation,
    workRoot,
    close: async () => {
      await ctx.close();
      await minio.stop();
      await rm(workRoot, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}

/** A real WAV file (16 kHz mono 16-bit PCM) of the given duration, as the client's encoder would produce. */
export async function buildWavFile(seconds: number): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'f18-wav-fixture-'));
  try {
    const localPath = join(dir, 'audio.wav');
    await execFileAsync(FFMPEG, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', `sine=frequency=330:duration=${seconds}`,
      '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le',
      localPath,
    ]);
    return await readFile(localPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export interface SeededSpeakingActivity {
  activityId: string;
  planId: string;
  rootActivityId: string;
}

/** A plan and a single speaking or pronunciation activity, active by default — F15's own fixture shape. */
export async function seedSpeakingActivity(
  ctx: TestContext,
  userId: string,
  lessonId: string,
  options: {
    kind?: 'pronunciation' | 'speaking';
    targetTags?: string[];
    planStatus?: 'active' | 'archived';
    state?: 'pending' | 'in_progress' | 'completed' | 'skipped';
    carriedFromActivityId?: string;
  } = {},
): Promise<SeededSpeakingActivity> {
  const now = new Date();
  const plan = await ctx.prisma.studyPlan.create({
    data: {
      userId,
      lessonId,
      origin: 'lesson',
      status: options.planStatus ?? 'active',
      precedenceAt: now,
      composition: 'deterministic',
      deterministicReason: 'no_profile',
      generalMaterial: true,
      rulesVersion: '1',
      rulesFingerprint: 'f'.repeat(64),
      taxonomyVersion: '2',
      createdAt: now,
      activatedAt: (options.planStatus ?? 'active') === 'active' ? now : null,
      archivedAt: options.planStatus === 'archived' ? now : null,
    },
  });

  const kind = options.kind ?? 'pronunciation';
  const state = options.state ?? 'pending';
  const activity = await ctx.prisma.studyPlanActivity.create({
    data: {
      planId: plan.id,
      userId,
      day: 1,
      position: 1,
      kind,
      contentItemId: null,
      title: kind === 'pronunciation' ? 'Read aloud: test passage' : 'Speaking: test prompt',
      targetTags: options.targetTags ?? [],
      estimatedMinutes: 4,
      rationale: 'Test fixture activity.',
      rationaleSource: 'template',
      placement: 'task',
      state,
      startedAt: state === 'pending' ? null : now,
      completedAt: state === 'completed' ? now : null,
      skippedAt: state === 'skipped' ? now : null,
      skipReason: state === 'skipped' ? 'test' : null,
      carriedFromActivityId: options.carriedFromActivityId,
    },
  });

  const rootActivityId = options.carriedFromActivityId ?? activity.id;
  return { activityId: activity.id, planId: plan.id, rootActivityId };
}

/** A `speaking_tasks` row with a known, test-controlled passage or prompt — bypasses corpus selection entirely. */
export async function seedSpeakingTask(
  ctx: TestContext,
  userId: string,
  rootActivityId: string,
  input:
    | { shape: 'read_aloud'; referenceText: string; targetTags?: string[]; focusTags?: string[] }
    | { shape: 'open_response'; prompt: string; hint?: string | null; targetTags?: string[]; focusTags?: string[] },
) {
  return ctx.prisma.speakingTask.create({
    data: {
      userId,
      rootActivityId,
      shape: input.shape,
      corpusEntryId: 'fixture-entry',
      corpusVersion: '1',
      corpusFingerprint: 'f'.repeat(64),
      referenceText: input.shape === 'read_aloud' ? input.referenceText : null,
      promptText: input.shape === 'open_response' ? input.prompt : null,
      hint: input.shape === 'open_response' ? (input.hint ?? null) : null,
      targetTags: input.targetTags ?? [],
      focusTags: input.focusTags ?? [],
    },
  });
}
