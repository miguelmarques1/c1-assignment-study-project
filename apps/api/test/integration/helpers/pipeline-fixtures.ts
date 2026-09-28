import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { getQueueToken } from '@nestjs/bullmq';
import { Prisma } from '@prisma/client';
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
import type { IngestionResult, ProfileSourceInput } from '../../../src/profile/profile-ingestion.contract';
import { ProfileIngestionService } from '../../../src/profile/profile-ingestion.service';
import { PromptRegistryService } from '../../../src/prompts/prompt-registry.service';
import {
  PRONUNCIATION_EXCERPT_RETRY_DELAYS_OVERRIDE,
  PRONUNCIATION_WORK_ROOT,
} from '../../../src/pronunciation/pronunciation.constants';
import { audioObjectKey } from '../../../src/recording/recording.constants';
import { FastTranscriptionClient } from '../../../src/speech/fast-transcription.client';
import { PronunciationAssessmentClient } from '../../../src/speech/pronunciation-assessment.client';
import { StorageService } from '../../../src/storage/storage.service';
import { FakeFastTranscriptionClient } from './fake-speech';
import { FakePronunciationAssessmentClient } from './fake-pronunciation';
import { startMinio, TEST_MINIO_ACCESS_KEY, TEST_MINIO_BUCKET, TEST_MINIO_SECRET_KEY, type StartedMinio } from './minio';
import { createTestContext, type TestContext } from './test-app';

const execFileAsync = promisify(execFile);
const FFMPEG = ffmpegPath as unknown as string;
const PASSWORD = 'a perfectly fine password';
const passwords = new PasswordService();

/** Three short retries instead of 30 s, 2 min and 8 min; the production values are pinned by a unit test. */
export const FAST_RETRY_POLICY = { attempts: 4, delaysMs: [40, 40, 40] };

/** Two short retries instead of 60 s and 300 s (F15's `plan_generation`). */
export const FAST_PLAN_GENERATION_RETRY_POLICY = { attempts: 3, delaysMs: [40, 40] };

/** Excerpt selection's two retries (5 s and 30 s in production), shortened the same way. */
export const FAST_SELECTION_RETRY_POLICY = { attempts: 3, delaysMs: [40, 40] };

/** Pronunciation assessment's own stage retries (60 s and 5 min in production), shortened the same way. */
export const FAST_PRONUNCIATION_RETRY_POLICY = { attempts: 3, delaysMs: [40, 40] };

/** The inline per-excerpt retries (2 s and 8 s in production), shortened to milliseconds. */
export const FAST_EXCERPT_RETRY_DELAYS = [10, 10];

/** Lesson analysis's own stage retries (1, 5 and 15 minutes in production), shortened the same way. */
export const FAST_ANALYSIS_RETRY_POLICY = { attempts: 4, delaysMs: [40, 40, 40] };

/** The profile update's retries (5 s and 30 s in production), shortened the same way. */
export const FAST_PROFILE_UPDATE_RETRY_POLICY = { attempts: 3, delaysMs: [40, 40] };

export interface PipelineTestContext {
  ctx: TestContext;
  minio: StartedMinio;
  storage: StorageService;
  speech: FakeFastTranscriptionClient;
  pronunciation: FakePronunciationAssessmentClient;
  /** F10's per-run work directory root — a test can assert it is empty once a run settles. */
  pronunciationWorkRoot: string;
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
  const pronunciation = new FakePronunciationAssessmentClient();
  const pronunciationWorkRoot = await mkdtemp(join(tmpdir(), 'f10-work-root-'));
  const ctx = await createTestContext({
    extraEnv: { ...storageEnv, ...extra.extraEnv },
    overrides: [
      { token: StorageService, useValue: storage },
      { token: FastTranscriptionClient, useValue: speech },
      { token: PronunciationAssessmentClient, useValue: pronunciation },
      { token: PRONUNCIATION_WORK_ROOT, useValue: pronunciationWorkRoot },
      { token: PRONUNCIATION_EXCERPT_RETRY_DELAYS_OVERRIDE, useValue: FAST_EXCERPT_RETRY_DELAYS },
      {
        token: PIPELINE_RETRY_OVERRIDES,
        useValue: {
          transcription: FAST_RETRY_POLICY,
          excerpt_selection: FAST_SELECTION_RETRY_POLICY,
          pronunciation_assessment: FAST_PRONUNCIATION_RETRY_POLICY,
          lesson_analysis: FAST_ANALYSIS_RETRY_POLICY,
          profile_update: FAST_PROFILE_UPDATE_RETRY_POLICY,
          plan_generation: FAST_PLAN_GENERATION_RETRY_POLICY,
        },
      },
      ...(typeof extra.overrides === 'function' ? extra.overrides() : (extra.overrides ?? [])),
    ],
  });
  // F11's lesson_analysis stage needs the real prompt (and its schema) to
  // validate the fake's responses exactly as production would.
  await ctx.app.get(PromptRegistryService).loadAll(join(__dirname, '..', '..', '..', 'prompts'));

  return {
    ctx,
    minio,
    storage,
    speech,
    pronunciation,
    pronunciationWorkRoot,
    close: async () => {
      await ctx.close();
      await minio.stop();
      await rm(pronunciationWorkRoot, { recursive: true, force: true }).catch(() => undefined);
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
  /** The Gemini key stored for this user, or null when they have none — most fixtures leave this unset (F11's own blocked-by-default path). */
  geminiKey: string | null;
}

/** A logged-in account, optionally holding an Azure Speech key and/or a Gemini key, both stored through the real vault encryption. */
export async function seedSpeaker(
  ctx: TestContext,
  displayName: string,
  options: {
    withKey?: boolean;
    region?: string;
    status?: 'valid' | 'unverified' | 'invalid';
    withGeminiKey?: boolean;
    geminiStatus?: 'valid' | 'unverified' | 'invalid';
  } = {},
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

  let geminiKey: string | null = null;
  if (options.withGeminiKey) {
    geminiKey = `AIza-test-key-for-${displayName.toLowerCase()}-0000000000`;
    await storeGeminiKey(ctx, user.id, geminiKey, options.geminiStatus ?? 'valid');
  }

  const response = await request(ctx.app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD });
  const cookie = (response.headers['set-cookie'] as unknown as string[])[0]!;
  return { id: user.id, displayName, cookie, azureKey, region, geminiKey };
}

export async function storeGeminiKey(
  ctx: TestContext,
  userId: string,
  key: string,
  status: 'valid' | 'unverified' | 'invalid' = 'valid',
): Promise<void> {
  const payload = ctx.app.get(CredentialCryptoService).encrypt(key);
  const data = {
    ciphertext: new Uint8Array(payload.ciphertext),
    iv: new Uint8Array(payload.iv),
    authTag: new Uint8Array(payload.authTag),
    lastFour: key.slice(-4),
    region: null,
    status,
  };
  await ctx.prisma.userCredential.upsert({
    where: { userId_provider: { userId, provider: 'gemini' } },
    create: { userId, provider: 'gemini', ...data },
    update: data,
  });
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
  /** Transcribed, but selection itself failed, so there is no selection row — and no job the drain would add. */
  selectionFailed?: boolean;
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
    const failure = { reasonCode: 'internal_error', reason: 'Something went wrong while processing this stage.' };
    const branch = await ctx.prisma.lessonPipelineBranch.create({
      data: participant.selectionFailed
        ? {
            lessonId: lesson.id,
            userId,
            stage: 'excerpt_selection',
            status: 'failed',
            launchedAt: now,
            failureCode: failure.reasonCode,
            failureReason: failure.reason,
          }
        : { lessonId: lesson.id, userId, stage: 'excerpt_selection', status: 'queued', launchedAt: now },
    });
    await ctx.prisma.lessonPipelineStage.createMany({
      data: [
        { branchId: branch.id, stage: 'transcription', status: 'completed', attempts: 1, startedAt: now, lastAttemptAt: now, finishedAt: now },
        participant.selectionFailed
          ? { branchId: branch.id, stage: 'excerpt_selection', status: 'failed', attempts: 3, startedAt: now, lastAttemptAt: now, finishedAt: now, ...failure }
          : { branchId: branch.id, stage: 'excerpt_selection', status: 'queued', queuedAt: now },
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

/** Adds the analysis job for a branch waiting at `lesson_analysis`, as F10's completion does. */
export async function startAnalysis(pipeline: PipelineTestContext, branchId: string, run = 1): Promise<void> {
  await pipeline.ctx.app.get(PipelineQueueService).enqueue(branchId, 'lesson_analysis', run);
}

export interface AnalysisReadyPronunciation {
  status: 'assessed';
  scores: { pronunciation: number; accuracy: number; fluency: number; prosody: number | null; completeness: number };
  worstPhonemes?: Array<{
    phoneme: string;
    meanAccuracy: number;
    occurrences: number;
    exampleWord: string;
    exampleExcerptId: string;
    exampleUtteranceId: string;
  }>;
  /** F10's ledger tags, what F12 ingests. */
  phonemeTags?: Array<{ tag: string; phoneme: string; occurrences: number; meanAccuracy: number; exampleWords: string[] }>;
}

export interface AnalysisReadyParticipant {
  speaker: Speaker;
  utterances: SeedUtterance[];
  /** Defaults to `no_sample` — F09 selected nothing and F10 never called Azure. */
  pronunciation?: AnalysisReadyPronunciation;
  /** The scenario row for this lesson, `ready` with the labels below; omit for `no_scenario`. */
}

export interface AnalysisReadyScenario {
  status: 'ready' | 'no_scenario' | 'failed';
  setting?: string;
  premise?: string;
  vocabularyDomain?: string;
  roles?: Array<{ label: string; relationship: string }>;
}

export interface AnalysisReadyCard {
  userId: string;
  status: 'ready' | 'pending' | 'failed';
  roleLabel?: string;
  background?: string;
  objective?: string;
  constraintText?: string;
  register?: 'formal' | 'neutral' | 'informal';
  targetExpressions?: string[];
}

/**
 * What F10's completing transaction leaves behind for every participant: a
 * stored transcript, a selection row (empty by default, since nothing here
 * needs real excerpts), a pronunciation result (`no_sample` unless scored
 * otherwise) and a branch waiting at `lesson_analysis` / `queued` — F11's own
 * resting point, the way `makeTranscribedLesson` fabricates F07/F08's.
 */
export async function makeAnalysisReadyLesson(
  pipeline: PipelineTestContext,
  participants: AnalysisReadyParticipant[],
  options: { scenario?: AnalysisReadyScenario; cards?: AnalysisReadyCard[]; durationSeconds?: number } = {},
): Promise<RecordedLesson> {
  const { ctx } = pipeline;
  const durationSeconds = options.durationSeconds ?? 1_800;
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

  if (options.scenario) {
    await ctx.prisma.lessonScenario.create({
      data: {
        lessonId: lesson.id,
        status: options.scenario.status,
        setting: options.scenario.setting ?? null,
        premise: options.scenario.premise ?? null,
        vocabularyDomain: options.scenario.vocabularyDomain ?? null,
        roles: options.scenario.roles ?? Prisma.JsonNull,
        discussionHooks: Prisma.JsonNull,
        generatedBy: participants[0]!.speaker.id,
      },
    });
  }

  for (const card of options.cards ?? []) {
    await ctx.prisma.lessonRoleCard.create({
      data: {
        lessonId: lesson.id,
        userId: card.userId,
        roleLabel: card.roleLabel ?? null,
        status: card.status,
        background: card.background ?? null,
        objective: card.objective ?? null,
        constraintText: card.constraintText ?? null,
        register: card.register ?? null,
        targetExpressions: card.targetExpressions ?? Prisma.JsonNull,
      },
    });
  }

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

    const transcriptId = await seedTranscript(ctx, lesson.id, userId, participant.utterances);

    const selection = await ctx.prisma.lessonExcerptSelection.create({
      data: {
        lessonId: lesson.id,
        userId,
        transcriptId,
        ruleVersion: '1',
        ruleFingerprint: 'a'.repeat(64),
        rules: {},
        focusSource: 'none',
        focusTags: [],
        utteranceCount: participant.utterances.length,
        eligibleCount: 0,
        selectedCount: 0,
        selectedAudioMs: 0,
        sparseSample: false,
      },
    });

    const pron = participant.pronunciation;
    await ctx.prisma.lessonPronunciationResult.create({
      data: pron
        ? {
            lessonId: lesson.id,
            userId,
            selectionId: selection.id,
            status: 'assessed',
            excerptCount: 1,
            assessedCount: 1,
            partialAssessment: false,
            sparseSample: false,
            quotaExhausted: false,
            pronunciation: pron.scores.pronunciation,
            accuracy: pron.scores.accuracy,
            fluency: pron.scores.fluency,
            prosody: pron.scores.prosody,
            completeness: pron.scores.completeness,
            assessedAudioMs: 5_000,
            worstPhonemes: pron.worstPhonemes ?? [],
            worstWords: [],
            phonemeTags: pron.phonemeTags ?? [],
            provider: 'azure_pronunciation_assessment',
            locale: 'en-US',
            phonemeAlphabet: 'IPA',
          }
        : {
            lessonId: lesson.id,
            userId,
            selectionId: selection.id,
            status: 'no_sample',
            excerptCount: 0,
            assessedCount: 0,
            partialAssessment: false,
            sparseSample: false,
            quotaExhausted: false,
            pronunciation: null,
            accuracy: null,
            fluency: null,
            prosody: null,
            completeness: null,
            assessedAudioMs: 0,
            worstPhonemes: [],
            worstWords: [],
            phonemeTags: [],
            provider: 'azure_pronunciation_assessment',
            locale: 'en-US',
            phonemeAlphabet: 'IPA',
          },
    });

    const now = new Date();
    const branch = await ctx.prisma.lessonPipelineBranch.create({
      data: { lessonId: lesson.id, userId, stage: 'lesson_analysis', status: 'queued', launchedAt: now },
    });
    await ctx.prisma.lessonPipelineStage.create({
      data: { branchId: branch.id, stage: 'lesson_analysis', status: 'queued', queuedAt: now },
    });
    branches.set(userId, branch.id);
  }

  return { lessonId: lesson.id, startedAt, branches, audioBytes: new Map() };
}

/** Adds the profile update job for a branch waiting at `profile_update`, as F11's completion does. */
export async function startProfileUpdate(pipeline: PipelineTestContext, branchId: string, run = 1): Promise<void> {
  await pipeline.ctx.app.get(PipelineQueueService).enqueue(branchId, 'profile_update', run);
}

export async function startPlanGeneration(pipeline: PipelineTestContext, branchId: string, run = 1): Promise<void> {
  await pipeline.ctx.app.get(PipelineQueueService).enqueue(branchId, 'plan_generation', run);
}

export interface SeededAnalysis {
  scores?: Partial<Record<'grammar' | 'vocabulary' | 'fluency' | 'interaction' | 'comprehension', number>>;
  /** Each quoted from the owner's utterance at `utteranceIdx`, when given. */
  errors?: Array<{ tag: string; quote: string; correction?: string; severity?: 'minor' | 'moderate' | 'major'; utteranceIdx?: number }>;
}

/** An analysis row with its errors, as F11's completing transaction writes it. */
export async function seedAnalysis(
  ctx: TestContext,
  lessonId: string,
  userId: string,
  analysis: SeededAnalysis = {},
): Promise<string> {
  const scores = { grammar: 65, vocabulary: 70, fluency: 72, interaction: 68, comprehension: 75, ...analysis.scores };
  const utterances = await ctx.prisma.lessonUtterance.findMany({ where: { lessonId, userId }, orderBy: { idx: 'asc' } });
  const row = await ctx.prisma.lessonAnalysis.create({
    data: {
      lessonId,
      userId,
      ...scores,
      justifications: { grammar: 'x', vocabulary: 'x', fluency: 'x', interaction: 'x', comprehension: 'x' },
      strengths: ['a', 'b', 'c'],
      recurringTags: [],
      topics: ['a', 'b', 'c'],
      scenarioContext: 'none',
      pronunciationContext: 'no_sample',
      transcriptTokensEstimated: 100,
      transcriptTruncated: false,
      taxonomyVersion: '2',
      promptId: 'lesson-analysis',
      promptVersion: '2',
      model: 'gemini-test',
      latencyMs: 1_000,
      schemaRetried: false,
    },
  });
  for (const [idx, error] of (analysis.errors ?? []).entries()) {
    await ctx.prisma.lessonAnalysisError.create({
      data: {
        analysisId: row.id,
        lessonId,
        userId,
        idx,
        quote: error.quote,
        tag: error.tag,
        correction: error.correction ?? 'a corrected sentence',
        explanation: 'why',
        severity: error.severity ?? 'moderate',
        utteranceId: error.utteranceIdx === undefined ? null : (utterances[error.utteranceIdx]?.id ?? null),
      },
    });
  }
  return row.id;
}

/**
 * What F11's completing transaction leaves behind: everything
 * `makeAnalysisReadyLesson` builds, plus each participant's analysis row,
 * `lesson_analysis` completed and the branch waiting at `profile_update` /
 * `queued` — F12's own resting point — with no job yet. A participant whose
 * `analysis` is null stays waiting at `lesson_analysis` instead.
 */
export async function makeProfileUpdateReadyLesson(
  pipeline: PipelineTestContext,
  participants: Array<AnalysisReadyParticipant & { analysis?: SeededAnalysis | null }>,
  options: { durationSeconds?: number } = {},
): Promise<RecordedLesson> {
  const { ctx } = pipeline;
  const lesson = await makeAnalysisReadyLesson(pipeline, participants, options);
  for (const participant of participants) {
    if (participant.analysis === null) {
      continue;
    }
    const userId = participant.speaker.id;
    const branchId = lesson.branches.get(userId)!;
    await seedAnalysis(ctx, lesson.lessonId, userId, participant.analysis);
    const now = new Date();
    await ctx.prisma.lessonPipelineStage.update({
      where: { branchId_stage: { branchId, stage: 'lesson_analysis' } },
      data: { status: 'completed', startedAt: now, finishedAt: now, attempts: 1 },
    });
    await ctx.prisma.lessonPipelineStage.create({
      data: { branchId, stage: 'profile_update', status: 'queued', queuedAt: now },
    });
    await ctx.prisma.lessonPipelineBranch.update({
      where: { id: branchId },
      data: { stage: 'profile_update', status: 'queued' },
    });
  }
  return lesson;
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

/** A bare account: no session and no keys — all the profile engine needs, since it never calls a provider. */
export async function seedUser(ctx: TestContext, displayName: string): Promise<string> {
  const user = await ctx.prisma.user.create({
    data: { email: `${displayName.toLowerCase()}@example.com`, displayName, passwordHash: 'x'.repeat(60) },
  });
  return user.id;
}

/** An ended lesson the users took part in, started at `startedAt` — the anchor a lesson source is keyed by. */
export async function seedLesson(ctx: TestContext, userIds: string[], startedAt: Date): Promise<string> {
  const lesson = await ctx.prisma.lesson.create({
    data: {
      room: 'classroom-main',
      openedBy: userIds[0]!,
      maxParticipants: 4,
      status: 'ended',
      startedAt,
      endedAt: new Date(startedAt.getTime() + 30 * 60_000),
      endReason: 'ended_by_participant',
      durationSeconds: 1_800,
      recordingStatus: 'recorded',
    },
  });
  for (const userId of userIds) {
    await ctx.prisma.lessonParticipant.create({
      data: { lessonId: lesson.id, userId, identity: userId, joinedAt: startedAt },
    });
  }
  return lesson.id;
}

export interface ProfileOccurrenceSeed {
  tag: string;
  quote?: string | null;
  correction?: string | null;
  severity?: 'minor' | 'moderate' | 'major' | null;
  exampleWords?: string[];
  instances?: number;
  utteranceId?: string | null;
}

/** A lesson source as `lesson-profile-sources.ts` builds it, from plain values. */
export function lessonSourceInput(options: {
  kind: 'lesson_analysis' | 'lesson_pronunciation';
  userId: string;
  lessonId: string;
  occurredAt: Date;
  revision?: string;
  scores?: Partial<Record<'grammar' | 'vocabulary' | 'fluency' | 'interaction' | 'comprehension', number>>;
  pronunciation?: { value: number; accuracy: number; prosody: number | null } | null;
  occurrences?: ProfileOccurrenceSeed[];
}): ProfileSourceInput {
  const measurements =
    options.kind === 'lesson_pronunciation'
      ? options.pronunciation
        ? [{ competency: 'pronunciation' as const, ...options.pronunciation }]
        : []
      : Object.entries(options.scores ?? {}).map(([competency, value]) => ({
          competency: competency as 'grammar',
          value: value!,
          accuracy: null,
          prosody: null,
        }));
  return {
    userId: options.userId,
    kind: options.kind,
    sourceKey: options.lessonId,
    revision: options.revision ?? `${options.kind}-${options.lessonId}`.slice(0, 64),
    lessonId: options.lessonId,
    activityId: null,
    occurredAt: options.occurredAt,
    label: null,
    measurements,
    occurrences: (options.occurrences ?? []).map((occurrence) => ({
      tag: occurrence.tag,
      quote: occurrence.quote ?? null,
      correction: occurrence.correction ?? null,
      severity: occurrence.severity ?? null,
      exampleWords: occurrence.exampleWords ?? [],
      instances: occurrence.instances ?? 1,
      analysisErrorId: null,
      utteranceId: occurrence.utteranceId ?? null,
    })),
    encounters: [],
  };
}

/** Applies one source through the real engine, in its own transaction, as the stage or the job would. */
export async function seedProfileSource(ctx: TestContext, input: ProfileSourceInput): Promise<IngestionResult> {
  const ingestion = ctx.app.get(ProfileIngestionService);
  return ctx.prisma.$transaction((tx) => ingestion.applySource(tx, input));
}

/**
 * A lesson whose profile update already ran: a lesson row, then its
 * pronunciation and analysis sources applied through the engine. For the
 * suites that need a profile to exist rather than to be built by the stage.
 */
export async function makeProfiledLesson(
  ctx: TestContext,
  userId: string,
  options: {
    startedAt: Date;
    scores?: Partial<Record<'grammar' | 'vocabulary' | 'fluency' | 'interaction' | 'comprehension', number>>;
    pronunciation?: { value: number; accuracy: number; prosody: number | null } | null;
    errors?: ProfileOccurrenceSeed[];
    phonemes?: ProfileOccurrenceSeed[];
  },
): Promise<string> {
  const lessonId = await seedLesson(ctx, [userId], options.startedAt);
  await seedProfileSource(
    ctx,
    lessonSourceInput({
      kind: 'lesson_pronunciation',
      userId,
      lessonId,
      occurredAt: options.startedAt,
      pronunciation: options.pronunciation ?? null,
      occurrences: options.phonemes ?? [],
    }),
  );
  await seedProfileSource(
    ctx,
    lessonSourceInput({
      kind: 'lesson_analysis',
      userId,
      lessonId,
      occurredAt: options.startedAt,
      scores: options.scores ?? { grammar: 70, vocabulary: 70, fluency: 70, interaction: 70, comprehension: 70 },
      occurrences: options.errors ?? [],
    }),
  );
  return lessonId;
}
