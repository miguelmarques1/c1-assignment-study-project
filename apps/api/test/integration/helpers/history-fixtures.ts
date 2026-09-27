import { Prisma } from '@prisma/client';

import { audioObjectKey } from '../../../src/recording/recording.constants';
import { seedTranscript, type SeedUtterance, type Speaker } from './pipeline-fixtures';
import type { TestContext } from './test-app';

/**
 * F19's direct-construction fixture: a lesson in any state F07 to F11 can
 * leave behind, without running the pipeline — the idiom
 * `makeAnalysisReadyLesson` and `makeTranscribedLesson` established. Each
 * participant's branch is given a resting point with realistic stage rows,
 * plus optional transcript, excerpts, pronunciation and analysis rows.
 */

/** The queued stages in the shared order — the ones that are rows in `lesson_pipeline_stages`. */
const QUEUED_STAGES = ['transcription', 'excerpt_selection', 'pronunciation_assessment', 'lesson_analysis', 'profile_update'] as const;
type QueuedStage = (typeof QUEUED_STAGES)[number];

export type HistoryBranch =
  /** No branch row at all. */
  | null
  /** Analysis completed; the branch waits at `profile_update` / `queued` — F11's own resting point. */
  | 'ready'
  | {
      stage: 'recording';
      status: 'verifying' | 'queued' | 'failed' | 'storage_unavailable';
      failureCode?: string;
      failureReason?: string;
    }
  | {
      stage: QueuedStage;
      status: 'queued' | 'running' | 'retrying' | 'blocked_missing_key' | 'failed';
      reasonCode?: string;
      reason?: string;
      providerMessage?: string;
      blockedProvider?: 'azure_speech' | 'gemini';
      progress?: { done: number; total: number };
    };

export interface HistoryExcerpt {
  /** Index into the participant's utterances (sorted by `startMs`). */
  utterance: number;
  scores: { pronunciation: number; accuracy: number; fluency: number; prosody: number | null; completeness: number };
  words: Array<{ word: string; accuracy: number; errorTypes?: string[] }>;
  reason?: string;
}

export interface HistoryAnalysis {
  scores: { grammar: number; vocabulary: number; fluency: number; interaction: number; comprehension: number };
  /** Every justification carries this text — a privacy test searches for it. */
  justification?: string;
  strengths?: string[];
  topics?: string[];
  errors?: Array<{
    quote: string;
    correction: string;
    explanation: string;
    severity: 'minor' | 'moderate' | 'major';
    tag: string;
    /** Index into the participant's utterances; null leaves the error unmatched. */
    utterance?: number | null;
  }>;
  scenarioContext?: 'full' | 'situation_only' | 'none';
  scenarioFit?: {
    roleLabel: string;
    registerExpected: 'formal' | 'neutral' | 'informal';
    registerMatched: boolean;
    registerComment: string;
    expressionsUsed: string[];
    expressionsNotUsed: string[];
  } | null;
}

export interface HistoryParticipant {
  speaker: Speaker;
  branch?: HistoryBranch;
  /** Verified audio size; null for a participant with no recorded audio. */
  audioBytes?: number | null;
  utterances?: SeedUtterance[];
  excerpts?: HistoryExcerpt[];
  /** The lesson-level pronunciation result; needs `utterances`. */
  pronunciation?:
    | 'no_sample'
    | {
        pronunciation: number;
        accuracy?: number;
        fluency?: number;
        prosody?: number | null;
        completeness?: number;
        /** The one worst word the result lists; a privacy test marks it. */
        worstWord?: string;
      };
  analysis?: HistoryAnalysis;
}

export interface HistoryScenario {
  status: 'pending' | 'ready' | 'failed' | 'no_scenario';
  title?: string | null;
  setting?: string;
  premise?: string;
  vocabularyDomain?: string;
  roles?: Array<{ label: string; relationship: string }>;
  discussionHooks?: string[];
}

export interface HistoryCard {
  userId: string;
  status: 'pending' | 'ready' | 'failed';
  roleLabel?: string | null;
  background?: string;
  objective?: string;
  constraintText?: string;
  register?: 'formal' | 'neutral' | 'informal';
  targetExpressions?: string[];
}

export interface HistoryLessonOptions {
  participants: HistoryParticipant[];
  lessonStatus?: 'waiting' | 'live' | 'ended' | 'ended_unexpectedly' | 'abandoned';
  recordingStatus?: string;
  startedAt?: Date;
  durationSeconds?: number;
  scenario?: HistoryScenario | null;
  cards?: HistoryCard[];
  /** Defaults to the classroom's room for ended lessons, and a unique one for open lessons. */
  room?: string;
}

export interface HistoryLesson {
  lessonId: string;
  startedAt: Date | null;
  branches: Map<string, string>;
  /** Each participant's utterance ids, in `idx` order. */
  utteranceIds: Map<string, string[]>;
}

let sequence = 0;
/** Without an explicit `startedAt`, each lesson starts an hour after the previous one, in creation order. */
function nextStart(): Date {
  sequence += 1;
  return new Date(Date.UTC(2026, 0, 1) + sequence * 3_600_000);
}

const OPEN_STATUSES = new Set(['waiting', 'live']);

export function defaultSituation(marker = 'shared'): HistoryScenario {
  return {
    status: 'ready',
    title: `The missed connection (${marker})`,
    setting: `A rebooking desk at a busy hub (${marker}).`,
    premise: `Only one seat is left on the evening flight (${marker}).`,
    vocabularyDomain: 'travel',
    roles: [
      { label: 'The Traveler', relationship: 'Needs the last seat to reach an interview' },
      { label: 'Airline agent', relationship: 'Must apply the priority rules' },
      { label: 'Stand-by passenger', relationship: 'Has been waiting since the morning' },
    ],
    discussionHooks: ['Who deserves priority?', 'What compensation is fair?', 'What alternatives exist?'],
  };
}

/** A ready card whose every private field carries `marker`, so a privacy test can search for it. */
export function markedCard(userId: string, marker: string, roleLabel = 'The Traveler'): HistoryCard {
  return {
    userId,
    status: 'ready',
    roleLabel,
    background: `Background ${marker}`,
    objective: `Objective ${marker}`,
    constraintText: `Constraint ${marker}`,
    register: 'neutral',
    targetExpressions: [`to be on the safe side ${marker}`, `with all due respect ${marker}`, `the bottom line ${marker}`],
  };
}

export function analysisOf(
  scores: HistoryAnalysis['scores'],
  overrides: Partial<Omit<HistoryAnalysis, 'scores'>> = {},
): HistoryAnalysis {
  return { scores, ...overrides };
}

function stageTimes(base: Date, index: number) {
  const startedAt = new Date(base.getTime() + index * 60_000);
  return { startedAt, finishedAt: new Date(startedAt.getTime() + 30_000) };
}

async function seedBranch(
  ctx: TestContext,
  lessonId: string,
  userId: string,
  spec: Exclude<HistoryBranch, null>,
  base: Date,
): Promise<string> {
  if (spec !== 'ready' && spec.stage === 'recording') {
    const failed = spec.status === 'failed';
    const branch = await ctx.prisma.lessonPipelineBranch.create({
      data: {
        lessonId,
        userId,
        stage: 'recording',
        status: spec.status,
        launchedAt: spec.status === 'queued' ? base : null,
        failureCode: failed ? (spec.failureCode ?? 'recording_missing') : null,
        failureReason: failed ? (spec.failureReason ?? 'No audio was recorded for you.') : null,
      },
    });
    return branch.id;
  }

  const target =
    spec === 'ready'
      ? { stage: 'profile_update' as const, status: 'queued' as const }
      : spec;
  const targetIndex = QUEUED_STAGES.indexOf(target.stage);
  const completedUpTo = spec === 'ready' ? QUEUED_STAGES.indexOf('lesson_analysis') : targetIndex - 1;
  const failed = target.status === 'failed';
  const reasonCode =
    'reasonCode' in target && target.reasonCode
      ? target.reasonCode
      : target.status === 'blocked_missing_key'
        ? 'credential_missing'
        : failed
          ? 'internal_error'
          : null;
  const reason =
    'reason' in target && target.reason
      ? target.reason
      : target.status === 'blocked_missing_key'
        ? 'Blocked — add your key to continue.'
        : failed
          ? 'Something went wrong while processing this stage.'
          : null;

  const branch = await ctx.prisma.lessonPipelineBranch.create({
    data: {
      lessonId,
      userId,
      stage: target.stage,
      status: target.status,
      launchedAt: base,
      failureCode: failed ? reasonCode : null,
      failureReason: failed ? reason : null,
    },
  });

  const rows: Prisma.LessonPipelineStageCreateManyInput[] = [];
  for (let index = 0; index <= completedUpTo; index++) {
    const times = stageTimes(base, index);
    rows.push({
      branchId: branch.id,
      stage: QUEUED_STAGES[index]!,
      status: 'completed',
      attempts: 1,
      startedAt: times.startedAt,
      lastAttemptAt: times.startedAt,
      finishedAt: times.finishedAt,
    });
  }
  const times = stageTimes(base, targetIndex);
  const pending = target.status === 'queued';
  rows.push({
    branchId: branch.id,
    stage: target.stage,
    status: target.status,
    attempts: pending ? 0 : 1,
    queuedAt: times.startedAt,
    startedAt: pending ? null : times.startedAt,
    lastAttemptAt: pending ? null : times.startedAt,
    nextAttemptAt: target.status === 'retrying' ? new Date(Date.now() + 3_600_000) : null,
    finishedAt: failed ? times.finishedAt : null,
    reasonCode: target.status === 'retrying' ? null : reasonCode,
    reason: target.status === 'retrying' ? null : reason,
    providerMessage: 'providerMessage' in target ? (target.providerMessage ?? null) : null,
    blockedProvider:
      target.status === 'blocked_missing_key'
        ? ('blockedProvider' in target && target.blockedProvider ? target.blockedProvider : 'azure_speech')
        : null,
    progressDone: 'progress' in target && target.progress ? target.progress.done : null,
    progressTotal: 'progress' in target && target.progress ? target.progress.total : null,
  });
  await ctx.prisma.lessonPipelineStage.createMany({ data: rows });
  return branch.id;
}

async function seedPronunciation(
  ctx: TestContext,
  lessonId: string,
  userId: string,
  transcriptId: string,
  utteranceIds: string[],
  utterances: SeedUtterance[],
  participant: HistoryParticipant,
): Promise<void> {
  const excerpts = participant.excerpts ?? [];
  const sorted = [...utterances].sort((a, b) => a.startMs - b.startMs);
  const selectedAudioMs = excerpts.reduce((sum, excerpt) => {
    const utterance = sorted[excerpt.utterance]!;
    return sum + (utterance.endMs - utterance.startMs);
  }, 0);

  const selection = await ctx.prisma.lessonExcerptSelection.create({
    data: {
      lessonId,
      userId,
      transcriptId,
      ruleVersion: '1',
      ruleFingerprint: 'b'.repeat(64),
      rules: {},
      focusSource: 'none',
      focusTags: [],
      utteranceCount: utterances.length,
      eligibleCount: excerpts.length,
      selectedCount: excerpts.length,
      selectedAudioMs,
      sparseSample: excerpts.length < 4,
    },
  });

  for (const [index, excerpt] of excerpts.entries()) {
    const utterance = sorted[excerpt.utterance]!;
    const row = await ctx.prisma.lessonExcerpt.create({
      data: {
        selectionId: selection.id,
        lessonId,
        userId,
        utteranceId: utteranceIds[excerpt.utterance]!,
        rank: index + 1,
        startMs: utterance.startMs,
        endMs: utterance.endMs,
        referenceText: utterance.text,
        selectionRuleVersion: '1',
        confidence: utterance.confidence,
        wordCount: Math.max(utterance.text.split(/\s+/).filter(Boolean).length, 1),
        fillerShare: 0,
        focusWordCount: 0,
        reason: excerpt.reason ?? `Selected: recognition confidence ${(utterance.confidence ?? 0).toFixed(2)}`,
      },
    });
    await ctx.prisma.lessonExcerptAssessment.create({
      data: {
        excerptId: row.id,
        lessonId,
        userId,
        status: 'assessed',
        attempts: 1,
        clipStartMs: utterance.startMs,
        clipEndMs: utterance.endMs,
        ...excerpt.scores,
        words: excerpt.words.map((word, i) => ({
          word: word.word,
          accuracy: word.accuracy,
          errorTypes: word.errorTypes ?? [],
          offsetMs: i * 300,
          durationMs: 300,
          phonemes: [],
        })),
        recognizedText: utterance.text,
        latencyMs: 5,
        assessedAt: new Date(),
      },
    });
  }

  const result = participant.pronunciation;
  if (!result) {
    return;
  }
  const assessedCount = Math.max(excerpts.length, 1);
  await ctx.prisma.lessonPronunciationResult.create({
    data:
      result === 'no_sample'
        ? {
            lessonId,
            userId,
            selectionId: selection.id,
            status: 'no_sample',
            excerptCount: 0,
            assessedCount: 0,
            partialAssessment: false,
            sparseSample: false,
            quotaExhausted: false,
            assessedAudioMs: 0,
            worstPhonemes: [],
            worstWords: [],
            phonemeTags: [],
            provider: 'azure_pronunciation_assessment',
            locale: 'en-US',
            phonemeAlphabet: 'IPA',
          }
        : {
            lessonId,
            userId,
            selectionId: selection.id,
            status: 'assessed',
            excerptCount: assessedCount,
            assessedCount,
            partialAssessment: false,
            sparseSample: assessedCount < 4,
            quotaExhausted: false,
            pronunciation: result.pronunciation,
            accuracy: result.accuracy ?? 80,
            fluency: result.fluency ?? 80,
            prosody: result.prosody === undefined ? 80 : result.prosody,
            completeness: result.completeness ?? 100,
            assessedAudioMs: Math.max(selectedAudioMs, 1_000),
            worstPhonemes: [],
            worstWords: utteranceIds[0]
              ? [
                  {
                    word: result.worstWord ?? 'postponed',
                    meanAccuracy: 54,
                    occurrences: 2,
                    errorTypes: ['Mispronunciation'],
                    exampleExcerptId: selection.id,
                    exampleUtteranceId: utteranceIds[0],
                  },
                ]
              : [],
            phonemeTags: [],
            provider: 'azure_pronunciation_assessment',
            locale: 'en-US',
            phonemeAlphabet: 'IPA',
          },
  });
}

async function seedAnalysis(
  ctx: TestContext,
  lessonId: string,
  userId: string,
  utteranceIds: string[],
  analysis: HistoryAnalysis,
  pronunciationContext: 'assessed' | 'no_sample',
): Promise<void> {
  const justification = analysis.justification ?? 'A fair performance.';
  const scenarioContext = analysis.scenarioContext ?? 'none';
  const row = await ctx.prisma.lessonAnalysis.create({
    data: {
      lessonId,
      userId,
      ...analysis.scores,
      justifications: {
        grammar: justification,
        vocabulary: justification,
        fluency: justification,
        interaction: justification,
        comprehension: justification,
      },
      strengths: analysis.strengths ?? ['Clear turn-taking', 'Good follow-up questions', 'Steady pace'],
      recurringTags: [],
      topics: analysis.topics ?? ['Conditionals', 'Register', 'Linking words'],
      scenarioContext,
      scenarioFit: scenarioContext === 'full' && analysis.scenarioFit ? analysis.scenarioFit : Prisma.DbNull,
      pronunciationContext,
      transcriptTokensEstimated: 1_000,
      transcriptTruncated: false,
      truncation: Prisma.DbNull,
      taxonomyVersion: '1',
      promptId: 'lesson-analysis',
      promptVersion: '2',
      model: 'gemini-test',
      latencyMs: 10,
      schemaRetried: false,
    },
  });
  const errors = analysis.errors ?? [];
  if (errors.length > 0) {
    await ctx.prisma.lessonAnalysisError.createMany({
      data: errors.map((error, idx) => ({
        analysisId: row.id,
        lessonId,
        userId,
        idx,
        quote: error.quote,
        tag: error.tag,
        correction: error.correction,
        explanation: error.explanation,
        severity: error.severity,
        utteranceId: error.utterance === null || error.utterance === undefined ? null : utteranceIds[error.utterance]!,
      })),
    });
  }
}

export async function makeHistoryLesson(ctx: TestContext, options: HistoryLessonOptions): Promise<HistoryLesson> {
  const lessonStatus = options.lessonStatus ?? 'ended';
  const open = OPEN_STATUSES.has(lessonStatus);
  const durationSeconds = options.durationSeconds ?? 1_800;
  const startedAt = lessonStatus === 'waiting' || lessonStatus === 'abandoned' ? null : (options.startedAt ?? nextStart());
  const endedAt = open ? null : new Date((startedAt ?? new Date()).getTime() + durationSeconds * 1000);
  const recordingStatus = options.recordingStatus ?? (open ? 'recording' : 'recorded');
  const finalized = !['idle', 'starting', 'recording', 'not_recording', 'finalizing'].includes(recordingStatus);

  const lesson = await ctx.prisma.lesson.create({
    data: {
      // Only one open lesson may exist per room; ended ones share the room.
      room: options.room ?? (open ? `history-open-${sequence}-${Math.random().toString(36).slice(2, 8)}` : 'classroom-main'),
      openedBy: options.participants[0]!.speaker.id,
      maxParticipants: 4,
      status: lessonStatus,
      startedAt,
      endedAt,
      endReason: open ? null : lessonStatus === 'abandoned' ? 'abandoned_before_start' : 'ended_by_participant',
      durationSeconds: startedAt && !open ? durationSeconds : null,
      recordingStatus,
      recordingFinalizedAt: finalized && endedAt ? new Date(endedAt.getTime() + 60_000) : null,
    },
  });

  if (options.scenario) {
    const scenario = options.scenario;
    await ctx.prisma.lessonScenario.create({
      data: {
        lessonId: lesson.id,
        status: scenario.status,
        title: scenario.title ?? null,
        setting: scenario.setting ?? null,
        premise: scenario.premise ?? null,
        vocabularyDomain: scenario.vocabularyDomain ?? null,
        roles: scenario.roles ?? Prisma.JsonNull,
        discussionHooks: scenario.discussionHooks ?? Prisma.JsonNull,
        generatedBy: options.participants[0]!.speaker.id,
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
  const utteranceIds = new Map<string, string[]>();
  const base = new Date((endedAt ?? new Date()).getTime() + 60_000);
  for (const [index, participant] of options.participants.entries()) {
    const userId = participant.speaker.id;
    const audioBytes = participant.audioBytes === undefined ? 200_000 : participant.audioBytes;
    await ctx.prisma.lessonParticipant.create({
      data: {
        lessonId: lesson.id,
        userId,
        identity: userId,
        joinedAt: new Date((startedAt ?? new Date()).getTime() + index * 1_000),
        connected: open,
        recordingStatus: audioBytes === null ? 'missing' : 'complete',
        audioObjectKey: audioBytes === null ? null : audioObjectKey(lesson.id, userId),
        audioBytes: audioBytes === null ? null : BigInt(audioBytes),
        recordingStartedAt: startedAt,
        audioDurationMs: audioBytes === null ? null : durationSeconds * 1000,
        capturedMs: audioBytes === null ? null : durationSeconds * 1000,
      },
    });

    if (participant.utterances) {
      const transcriptId = await seedTranscript(ctx, lesson.id, userId, participant.utterances);
      const ids = (
        await ctx.prisma.lessonUtterance.findMany({
          where: { lessonId: lesson.id, userId },
          orderBy: { idx: 'asc' },
          select: { id: true },
        })
      ).map((row) => row.id);
      utteranceIds.set(userId, ids);
      if (participant.excerpts || participant.pronunciation) {
        await seedPronunciation(ctx, lesson.id, userId, transcriptId, ids, participant.utterances, participant);
      }
      if (participant.analysis) {
        await seedAnalysis(
          ctx,
          lesson.id,
          userId,
          ids,
          participant.analysis,
          participant.pronunciation && participant.pronunciation !== 'no_sample' ? 'assessed' : 'no_sample',
        );
      }
    }

    if (participant.branch) {
      branches.set(userId, await seedBranch(ctx, lesson.id, userId, participant.branch, base));
    }
  }

  return { lessonId: lesson.id, startedAt, branches, utteranceIds };
}
