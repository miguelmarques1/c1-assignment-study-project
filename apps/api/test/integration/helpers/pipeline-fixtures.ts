import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import ffmpegPath from 'ffmpeg-static';
import request from 'supertest';

import { PasswordService } from '../../../src/auth/password.service';
import { resetEnvCache } from '../../../src/config/env';
import { CredentialCryptoService } from '../../../src/credentials/credential-crypto.service';
import { PIPELINE_RETRY_OVERRIDES } from '../../../src/pipeline/pipeline-stage.registry';
import { PIPELINE_QUEUE } from '../../../src/pipeline/pipeline.constants';
import { PipelineQueueService } from '../../../src/pipeline/pipeline-queue.service';
import { PipelineService } from '../../../src/pipeline/pipeline.service';
import { audioObjectKey } from '../../../src/recording/recording.constants';
import { FastTranscriptionClient } from '../../../src/speech/fast-transcription.client';
import { StorageService } from '../../../src/storage/storage.service';
import { FakeFastTranscriptionClient } from './fake-speech';
import { startMinio, TEST_MINIO_ACCESS_KEY, TEST_MINIO_BUCKET, TEST_MINIO_SECRET_KEY, type StartedMinio } from './minio';
import { createTestContext, type TestContext } from './test-app';

const execFileAsync = promisify(execFile);
const FFMPEG = ffmpegPath as unknown as string;
const PASSWORD = 'a perfectly fine password';
const passwords = new PasswordService();

/** Three short retries instead of 30 s, 2 min and 8 min; the production values are pinned by a unit test. */
export const FAST_RETRY_POLICY = { attempts: 4, delaysMs: [40, 40, 40] };

/** Excerpt selection's two retries (5 s and 30 s in production), shortened the same way. */
export const FAST_SELECTION_RETRY_POLICY = { attempts: 3, delaysMs: [40, 40] };

export interface PipelineTestContext {
  ctx: TestContext;
  minio: StartedMinio;
  storage: StorageService;
  speech: FakeFastTranscriptionClient;
  close: () => Promise<void>;
}

/**
 * The real API — vault, executor, pipeline runner, BullMQ worker on the
 * Testcontainers Redis, MinIO for the audio — with Azure faked at the one
 * class that calls it and the transcription schedule shortened.
 */
type Overrides = Array<{ token: unknown; useValue: unknown }>;

export async function createPipelineTestContext(
  extra: {
    extraEnv?: Record<string, string>;
    /** A function when the overrides read the environment in their constructors, like F07's fakes. */
    overrides?: Overrides | (() => Overrides);
  } = {},
): Promise<PipelineTestContext> {
  const minio = await startMinio();
  const storageEnv = {
    S3_ENDPOINT: minio.endpoint,
    S3_ACCESS_KEY: TEST_MINIO_ACCESS_KEY,
    S3_SECRET_KEY: TEST_MINIO_SECRET_KEY,
    S3_BUCKET: TEST_MINIO_BUCKET,
  };

  // StorageService reads the environment in its constructor, and has to
  // exist before the app does to be handed over as an override.
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
  const ctx = await createTestContext({
    extraEnv: { ...storageEnv, ...extra.extraEnv },
    overrides: [
      { token: StorageService, useValue: storage },
      { token: FastTranscriptionClient, useValue: speech },
      {
        token: PIPELINE_RETRY_OVERRIDES,
        useValue: { transcription: FAST_RETRY_POLICY, excerpt_selection: FAST_SELECTION_RETRY_POLICY },
      },
      ...(typeof extra.overrides === 'function' ? extra.overrides() : (extra.overrides ?? [])),
    ],
  });

  return {
    ctx,
    minio,
    storage,
    speech,
    close: async () => {
      await ctx.close();
      await minio.stop();
    },
  };
}

export interface Speaker {
  id: string;
  displayName: string;
  cookie: string;
  /** The Azure key stored for this user, or null when they have none. */
  azureKey: string | null;
  region: string;
}

/** A logged-in account, optionally holding an Azure Speech key stored through the real vault encryption. */
export async function seedSpeaker(
  ctx: TestContext,
  displayName: string,
  options: { withKey?: boolean; region?: string; status?: 'valid' | 'unverified' | 'invalid' } = {},
): Promise<Speaker> {
  const email = `${displayName.toLowerCase()}@example.com`;
  const user = await ctx.prisma.user.create({
    data: { email, displayName, passwordHash: await passwords.hash(PASSWORD) },
  });

  const region = options.region ?? 'eastus2';
  let azureKey: string | null = null;
  if (options.withKey !== false) {
    azureKey = `azure-test-key-for-${displayName.toLowerCase()}-00000000`;
    await storeAzureKey(ctx, user.id, azureKey, region, options.status ?? 'valid');
  }

  const response = await request(ctx.app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD });
  const cookie = (response.headers['set-cookie'] as unknown as string[])[0]!;
  return { id: user.id, displayName, cookie, azureKey, region };
}

export async function storeAzureKey(
  ctx: TestContext,
  userId: string,
  key: string,
  region: string,
  status: 'valid' | 'unverified' | 'invalid' = 'valid',
): Promise<void> {
  const payload = ctx.app.get(CredentialCryptoService).encrypt(key);
  const data = {
    ciphertext: new Uint8Array(payload.ciphertext),
    iv: new Uint8Array(payload.iv),
    authTag: new Uint8Array(payload.authTag),
    lastFour: key.slice(-4),
    region,
    status,
  };
  await ctx.prisma.userCredential.upsert({
    where: { userId_provider: { userId, provider: 'azure_speech' } },
    create: { userId, provider: 'azure_speech', ...data },
    update: data,
  });
}

/** A short real Ogg/Opus file; its bytes are what the fake sees uploaded. The fake decides what was "said". */
export async function uploadAudio(storage: StorageService, key: string, seconds: number): Promise<number> {
  const dir = await mkdtemp(join(tmpdir(), 'f08-audio-fixture-'));
  try {
    const localPath = join(dir, 'audio.ogg');
    await execFileAsync(FFMPEG, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', `sine=frequency=330:duration=${seconds}`,
      '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '48k',
      localPath,
    ]);
    await storage.uploadFile(key, localPath, 'audio/ogg');
    return (await storage.statObject(key))!;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export interface RecordedParticipant {
  speaker: Speaker;
  /** When this participant's `audio.ogg` second 0 falls, relative to the lesson's start. */
  recordingOffsetMs?: number;
  /** Seconds of fixture audio; long enough to clear F07's 10 KB floor. */
  audioSeconds?: number;
  /** Skip uploading the object (for the unreadable-storage case). */
  withoutObject?: boolean;
}

export interface RecordedLesson {
  lessonId: string;
  startedAt: Date;
  branches: Map<string, string>;
  audioBytes: Map<string, number>;
}

/**
 * What F07 leaves behind for a finalized lesson: each participant with a
 * verified `audio.ogg` and a branch at `recording`/`queued` with
 * `launched_at` set — exactly how F07's finalizer writes it. The pipeline
 * then takes it from there, as in production.
 */
export async function makeRecordedLesson(
  pipeline: PipelineTestContext,
  participants: RecordedParticipant[],
): Promise<RecordedLesson> {
  const { ctx, storage } = pipeline;
  const durationSeconds = 600;
  const startedAt = new Date(Date.now() - durationSeconds * 1000);
  const lesson = await ctx.prisma.lesson.create({
    data: {
      room: 'classroom-main',
      openedBy: participants[0]!.speaker.id,
      maxParticipants: 4,
      status: 'ended',
      startedAt,
      endedAt: new Date(),
      endReason: 'ended_by_participant',
      durationSeconds,
      recordingStatus: 'recorded',
      recordingFinalizedAt: new Date(),
    },
  });

  const branches = new Map<string, string>();
  const audioBytes = new Map<string, number>();
  for (const participant of participants) {
    const userId = participant.speaker.id;
    const key = audioObjectKey(lesson.id, userId);
    const bytes = participant.withoutObject ? 20_000 : await uploadAudio(storage, key, participant.audioSeconds ?? 4);
    audioBytes.set(userId, bytes);
    await ctx.prisma.lessonParticipant.create({
      data: {
        lessonId: lesson.id,
        userId,
        identity: userId,
        joinedAt: startedAt,
        connected: false,
        recordingStatus: 'complete',
        audioObjectKey: key,
        audioBytes: BigInt(bytes),
        recordingStartedAt: new Date(startedAt.getTime() + (participant.recordingOffsetMs ?? 0)),
        audioDurationMs: durationSeconds * 1000,
        capturedMs: durationSeconds * 1000,
      },
    });
    const branch = await ctx.prisma.lessonPipelineBranch.create({
      data: { lessonId: lesson.id, userId, stage: 'recording', status: 'queued', launchedAt: new Date() },
    });
    branches.set(userId, branch.id);
  }

  return { lessonId: lesson.id, startedAt, branches, audioBytes };
}

/** What F07's finalizer does for each verified participant. */
export async function launchAll(pipeline: PipelineTestContext, lesson: RecordedLesson): Promise<void> {
  const service = pipeline.ctx.app.get(PipelineService);
  for (const userId of lesson.branches.keys()) {
    await service.launch({ lessonId: lesson.lessonId, userId });
  }
}

export interface SeedUtterance {
  /** Offsets in the participant's `audio.ogg`, as F08 stores them. */
  startMs: number;
  endMs: number;
  text: string;
  confidence: number | null;
}

export interface TranscribedParticipant {
  speaker: Speaker;
  /** What F08 stored for this participant; absent or null for a branch waiting without a transcript. */
  utterances?: SeedUtterance[] | null;
  /** A branch that never got past transcription, so it never reaches selection. */
  failedAtTranscription?: boolean;
}

/**
 * What F08's completing transaction leaves behind: a stored transcript and
 * a branch waiting at `excerpt_selection` / `queued` (transcription row
 * completed, selection row queued at run 1), with no job yet. Words carry
 * the utterance's text spread over its span with no confidence, which is
 * fast transcription's shape. No audio is uploaded: selection never reads it.
 */
export async function makeTranscribedLesson(
  pipeline: PipelineTestContext,
  participants: TranscribedParticipant[],
): Promise<RecordedLesson> {
  const { ctx } = pipeline;
  const durationSeconds = 1_800;
  const startedAt = new Date(Date.now() - durationSeconds * 1000);
  const lesson = await ctx.prisma.lesson.create({
    data: {
      room: 'classroom-main',
      openedBy: participants[0]!.speaker.id,
      maxParticipants: 4,
      status: 'ended',
      startedAt,
      endedAt: new Date(),
      endReason: 'ended_by_participant',
      durationSeconds,
      recordingStatus: 'recorded',
      recordingFinalizedAt: new Date(),
    },
  });

  const branches = new Map<string, string>();
  for (const participant of participants) {
    const userId = participant.speaker.id;
    await ctx.prisma.lessonParticipant.create({
      data: {
        lessonId: lesson.id,
        userId,
        identity: userId,
        joinedAt: startedAt,
        connected: false,
        recordingStatus: 'complete',
        audioObjectKey: audioObjectKey(lesson.id, userId),
        audioBytes: BigInt(200_000),
        recordingStartedAt: startedAt,
        audioDurationMs: durationSeconds * 1000,
        capturedMs: durationSeconds * 1000,
      },
    });

    const now = new Date();
    if (participant.failedAtTranscription) {
      const branch = await ctx.prisma.lessonPipelineBranch.create({
        data: {
          lessonId: lesson.id,
          userId,
          stage: 'transcription',
          status: 'failed',
          failureCode: 'transcription_service_error',
          failureReason: 'Azure Speech could not transcribe this recording.',
          launchedAt: now,
        },
      });
      await ctx.prisma.lessonPipelineStage.create({
        data: {
          branchId: branch.id,
          stage: 'transcription',
          status: 'failed',
          attempts: 4,
          startedAt: now,
          lastAttemptAt: now,
          finishedAt: now,
          reasonCode: 'transcription_service_error',
          reason: 'Azure Speech could not transcribe this recording.',
        },
      });
      branches.set(userId, branch.id);
      continue;
    }

    if (participant.utterances) {
      await seedTranscript(ctx, lesson.id, userId, participant.utterances);
    }
    const branch = await ctx.prisma.lessonPipelineBranch.create({
      data: { lessonId: lesson.id, userId, stage: 'excerpt_selection', status: 'queued', launchedAt: now },
    });
    await ctx.prisma.lessonPipelineStage.createMany({
      data: [
        { branchId: branch.id, stage: 'transcription', status: 'completed', attempts: 1, startedAt: now, lastAttemptAt: now, finishedAt: now },
        { branchId: branch.id, stage: 'excerpt_selection', status: 'queued', queuedAt: now },
      ],
    });
    branches.set(userId, branch.id);
  }

  return { lessonId: lesson.id, startedAt, branches, audioBytes: new Map() };
}

/** A transcript and its utterances exactly as F08's writer stores them, `idx` in offset order. */
export async function seedTranscript(
  ctx: TestContext,
  lessonId: string,
  userId: string,
  utterances: SeedUtterance[],
): Promise<string> {
  const ordered = [...utterances].sort((a, b) => a.startMs - b.startMs);
  const withWords = ordered.map((utterance) => {
    const texts = utterance.text.split(/\s+/).filter((text) => text.length > 0);
    const step = Math.floor((utterance.endMs - utterance.startMs) / Math.max(texts.length, 1));
    return {
      ...utterance,
      words: texts.map((text, i) => ({ text, startMs: utterance.startMs + i * step, durationMs: step, confidence: null })),
    };
  });
  const transcript = await ctx.prisma.lessonTranscript.create({
    data: {
      lessonId,
      userId,
      provider: 'azure_fast_transcription',
      apiVersion: '2025-10-15',
      locale: 'en-US',
      audioDurationMs: null,
      latencyMs: 1,
      utteranceCount: Math.max(withWords.length, 1),
      wordCount: withWords.reduce((sum, utterance) => sum + utterance.words.length, 0),
    },
  });
  await ctx.prisma.lessonUtterance.createMany({
    data: withWords.map((utterance, idx) => ({
      transcriptId: transcript.id,
      lessonId,
      userId,
      idx,
      startMs: utterance.startMs,
      endMs: utterance.endMs,
      text: utterance.text,
      confidence: utterance.confidence,
      words: utterance.words,
    })),
  });
  return transcript.id;
}

/** Adds the selection job for a branch waiting at `excerpt_selection`, as the transcription stage's completion does. */
export async function startSelection(pipeline: PipelineTestContext, branchId: string, run = 1): Promise<void> {
  await pipeline.ctx.app.get(PipelineQueueService).enqueue(branchId, 'excerpt_selection', run);
}

/** Polls a branch's stage row until it reaches one of `statuses`. The worker is asynchronous; tests wait on its end state. */
export async function waitForStage(
  ctx: TestContext,
  branchId: string,
  stage: string,
  statuses: string[],
  timeoutMs = 20_000,
) {
  const started = Date.now();
  for (;;) {
    const row = await ctx.prisma.lessonPipelineStage.findUnique({
      where: { branchId_stage: { branchId, stage } },
    });
    if (row && statuses.includes(row.status)) {
      return row;
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Stage ${stage} of branch ${branchId} never reached ${statuses.join('/')}; last: ${row?.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * Waits until no pipeline job is running or about to run. A test that
 * stops watching once its own stage completes still leaves the stages after
 * it running on the worker (excerpt selection follows every transcription),
 * and deleting their lesson under a completing transaction deadlocks.
 */
async function settlePipeline(ctx: TestContext, timeoutMs = 10_000): Promise<void> {
  const queue = ctx.app.get<Queue>(getQueueToken(PIPELINE_QUEUE), { strict: false });
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const counts = await queue.getJobCounts('active', 'waiting', 'prioritized', 'delayed');
    if (Object.values(counts).every((count) => count === 0)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Removes every lesson, pipeline and user row between tests; the cascade takes stages, transcripts and utterances. */
export async function resetPipelineTables(ctx: TestContext): Promise<void> {
  await settlePipeline(ctx);
  await ctx.prisma.lesson.deleteMany();
  await ctx.prisma.credentialUsage.deleteMany();
  await ctx.prisma.userCredential.deleteMany();
  await ctx.prisma.user.deleteMany();
}
