import type {
  LessonAnalysisView,
  LessonDetailView,
  LessonList,
  LessonPipelineView,
  LessonPronunciationView,
  LessonRecordingView,
  LessonScenarioView,
  LessonSummary,
  LessonTranscriptView,
  PipelineStageView,
} from '@english-quest/shared';

/** Typed fixtures of every view F19's web areas compose, shaped exactly like the API's responses. */

export const LESSON_ID = '9f1c4d7e-3b2a-4f51-9d0c-7a6b5e4c3d21';
export const ME = '3f8b1a20-5c6d-4e7f-8a91-2b3c4d5e6f70';
export const ANA = 'b21e9a44-7f30-4c18-9e55-1d2c3b4a5e6f';
export const BRUNO = 'c32f0b55-8a41-4d29-8f66-2e3d4c5b6a7f';
export const U1 = '11111111-1111-4111-8111-111111111111';
export const U2 = '22222222-2222-4222-8222-222222222222';
export const U3 = '33333333-3333-4333-8333-333333333333';
export const U4 = '44444444-4444-4444-8444-444444444444';

export function summary(overrides: Partial<LessonSummary> = {}): LessonSummary {
  return {
    lessonId: LESSON_ID,
    startedAt: '2026-09-24T14:10:03.000Z',
    endedAt: '2026-09-24T15:02:41.000Z',
    durationSeconds: 3158,
    participants: [
      { userId: ME, displayName: 'Miguel', isMe: true },
      { userId: ANA, displayName: 'Ana', isMe: false },
    ],
    scenarioTitle: 'The missed connection',
    vocabularyDomain: 'travel',
    status: 'ready',
    flags: [],
    activeStage: null,
    statusReason: null,
    headline: 'Grammar +4 · Pronunciation −2',
    storageBytes: 48_213_504,
    ...overrides,
  };
}

export function lessonList(lessons: LessonSummary[], overrides: Partial<LessonList> = {}): LessonList {
  return { lessons, nextCursor: null, totalStorageBytes: 13_002_342, ...overrides };
}

export function detail(overrides: Partial<LessonDetailView> = {}): LessonDetailView {
  return {
    ...summary(),
    scenario: { status: 'ready', myCardStatus: 'ready' },
    others: [
      {
        userId: ANA,
        displayName: 'Ana',
        stages: [
          { stage: 'recording', state: 'completed', startedAt: '2026-09-24T14:10:03.000Z', finishedAt: '2026-09-24T15:03:30.000Z' },
          { stage: 'transcription', state: 'completed', startedAt: '2026-09-24T15:03:31.000Z', finishedAt: '2026-09-24T15:06:12.000Z' },
          { stage: 'excerpt_selection', state: 'completed', startedAt: '2026-09-24T15:06:12.000Z', finishedAt: '2026-09-24T15:06:13.000Z' },
          { stage: 'pronunciation_assessment', state: 'pending', startedAt: null, finishedAt: null },
          { stage: 'lesson_analysis', state: 'not_started', startedAt: null, finishedAt: null },
          { stage: 'profile_update', state: 'not_started', startedAt: null, finishedAt: null },
          { stage: 'plan_generation', state: 'not_started', startedAt: null, finishedAt: null },
        ],
      },
    ],
    ...overrides,
  };
}

export function readyAnalysis(): LessonAnalysisView {
  return {
    lessonId: LESSON_ID,
    status: 'ready',
    analysis: {
      competencies: [
        { competency: 'grammar', score: 72, justification: 'Mostly accurate tenses.', delta: 4 },
        { competency: 'vocabulary', score: 68, justification: 'Some range.', delta: -2 },
        { competency: 'fluency', score: 70, justification: 'Steady pace.', delta: 0 },
        { competency: 'interaction', score: 75, justification: 'Good turn-taking.', delta: null },
        { competency: 'comprehension', score: 80, justification: 'Followed well.', delta: 1 },
      ],
      strengths: ['Clear turn-taking', 'Good follow-up questions', 'Steady pace'],
      errors: [
        {
          quote: 'I have went there yesterday',
          correction: 'I went there yesterday',
          correctionSegments: [{ text: 'I went there yesterday', changed: false }],
          explanation: 'Use the past simple with a finished time.',
          severity: 'minor',
          tag: 'grammar:present-perfect',
          tagLabel: 'Present perfect',
          recurring: false,
          recurrence: null,
          utteranceId: U3,
        },
        {
          quote: 'if I would have known, I would have booked earlier',
          correction: 'if I had known, I would have booked earlier',
          correctionSegments: [
            { text: 'if I', changed: false },
            { text: 'had', changed: true },
            { text: 'known, I would have booked earlier', changed: false },
          ],
          explanation: 'The third conditional takes the past perfect after "if".',
          severity: 'major',
          tag: 'grammar:conditional-3',
          tagLabel: 'Third conditional',
          recurring: true,
          recurrence: { count: 4, label: '4th time' },
          utteranceId: U1,
        },
        {
          quote: 'make a decision about it',
          correction: 'reach a decision about it',
          correctionSegments: [
            { text: 'reach', changed: true },
            { text: 'a decision about it', changed: false },
          ],
          explanation: 'A more natural collocation.',
          severity: 'moderate',
          tag: 'vocab:collocation',
          tagLabel: 'Collocation',
          recurring: false,
          recurrence: null,
          utteranceId: null,
        },
      ],
      recurringTags: ['grammar:conditional-3', 'discourse:hedging'],
      scenarioContext: 'full',
      scenarioFit: {
        roleLabel: 'The Traveler',
        registerExpected: 'neutral',
        registerMatched: true,
        registerComment: 'Polite without being stiff.',
        expressionsUsed: ['to be on the safe side'],
        expressionsNotUsed: ['with all due respect', 'the bottom line is'],
      },
      topicsToPractice: ['Conditionals', 'Collocations', 'Hedging'],
      notes: [],
      analyzedAt: '2026-09-24T15:20:00.000Z',
    },
  };
}

export function assessedPronunciation(): LessonPronunciationView {
  return {
    lessonId: LESSON_ID,
    status: 'assessed',
    result: {
      scores: { pronunciation: 77.6, accuracy: 74.5, fluency: 70.2, prosody: null, completeness: 100 },
      overall: { score: 78, delta: -2 },
      excerptCount: 2,
      assessedCount: 2,
      partialAssessment: false,
      sparsePronunciationSample: true,
      quotaExhausted: false,
      notes: ['Based on only 2 excerpts — this score is less reliable than usual.'],
      worstPhonemes: [{ phoneme: '/θ/', meanAccuracy: 41.2, occurrences: 3, exampleWord: 'think', exampleUtteranceId: U1 }],
      worstWords: [{ word: 'postponed', meanAccuracy: 54.4, occurrences: 2, errorTypes: ['Mispronunciation'], exampleUtteranceId: U3 }],
    },
    excerpts: [
      {
        excerptId: 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1',
        utteranceId: U1,
        rank: 1,
        referenceText: 'if I would have known, I would have booked earlier',
        durationMs: 5000,
        pronunciation: { status: 'assessed', scores: { pronunciation: 71.4, accuracy: 74.5, fluency: 70.2, prosody: 66.8, completeness: 100 } },
      },
      {
        excerptId: 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2',
        utteranceId: U3,
        rank: 2,
        referenceText: 'I have went there yesterday',
        durationMs: 4000,
        pronunciation: { status: 'assessed', scores: { pronunciation: 84.6, accuracy: 86, fluency: 80, prosody: null, completeness: 100 } },
      },
    ],
  };
}

export function scenarioView(overrides: Partial<LessonScenarioView> = {}): LessonScenarioView {
  return {
    lessonId: LESSON_ID,
    status: 'ready',
    situation: {
      title: 'The missed connection',
      setting: 'A rebooking desk at a busy European hub after a cancelled flight.',
      premise: 'Only one seat is left on the evening flight, and two travellers need it.',
      roles: [
        { label: 'The Traveler', relationship: 'Needs the last seat to reach a job interview' },
        { label: 'Airline agent at the rebooking desk', relationship: "Must apply the airline's priority rules" },
      ],
      vocabularyDomain: 'travel',
      discussionHooks: ['Who deserves priority?', 'What compensation is fair?', 'What alternatives exist?'],
    },
    myRoleLabel: 'The Traveler',
    myCard: {
      status: 'ready',
      background: 'You are flying to Lisbon for a final-round interview tomorrow morning.',
      objective: 'Get the last seat without revealing the interview is optional.',
      constraint: 'You already declined a voucher earlier today.',
      register: 'neutral',
      targetExpressions: ['to be on the safe side', 'with all due respect', 'the bottom line is'],
    },
    ...overrides,
  };
}

export function transcriptView(): LessonTranscriptView {
  const assessed = assessedPronunciation().excerpts;
  return {
    lessonId: LESSON_ID,
    lessonStartedAt: '2026-09-24T14:10:03.000Z',
    speakers: [
      { userId: ME, displayName: 'Miguel', isMe: true, status: 'available' },
      { userId: ANA, displayName: 'Ana', isMe: false, status: 'available' },
      { userId: BRUNO, displayName: 'Bruno', isMe: false, status: 'pending' },
    ],
    myExcerptSelection: null,
    utterances: [
      {
        id: U1,
        userId: ME,
        startMs: 5_000,
        endMs: 10_000,
        text: 'if I would have known, I would have booked earlier',
        confidence: 0.62,
        words: [],
        excerpt: {
          rank: 1,
          reason: 'Selected: recognition confidence 0.62, 10 words',
          confidence: 0.62,
          wordCount: 10,
          durationMs: 5000,
          focusWordCount: 0,
          ruleVersion: '1',
          pronunciation: assessed[0]!.pronunciation,
          assessedWords: [
            { text: 'known', accuracy: 54, errorTypes: ['Mispronunciation'], band: 'poor' },
            { text: 'booked', accuracy: 71, errorTypes: [], band: 'fair' },
            { text: 'earlier', accuracy: 93, errorTypes: [], band: 'good' },
          ],
        },
      },
      { id: U2, userId: ANA, startMs: 12_000, endMs: 15_000, text: 'That makes sense.' },
      {
        id: U3,
        userId: ME,
        startMs: 247_000,
        endMs: 251_000,
        text: 'I have went there yesterday',
        confidence: 0.7,
        words: [],
        excerpt: {
          rank: 2,
          reason: 'Selected: recognition confidence 0.70, 5 words',
          confidence: 0.7,
          wordCount: 5,
          durationMs: 4000,
          focusWordCount: 0,
          ruleVersion: '1',
          pronunciation: assessed[1]!.pronunciation,
          assessedWords: [{ text: 'went', accuracy: 86, errorTypes: [], band: 'good' }],
        },
      },
      { id: U4, userId: ANA, startMs: 3_723_000, endMs: 3_725_000, text: 'Shall we wrap up?' },
    ],
  };
}

function stage(overrides: Partial<PipelineStageView> & Pick<PipelineStageView, 'stage' | 'status'>): PipelineStageView {
  return {
    startedAt: '2026-09-24T15:03:31.000Z',
    finishedAt: null,
    lastAttemptAt: '2026-09-24T15:03:31.000Z',
    nextAttemptAt: null,
    attempts: 1,
    reasonCode: null,
    reason: null,
    providerMessage: null,
    blockedProvider: null,
    retryable: false,
    progress: null,
    ...overrides,
  };
}

/** The caller's branch with each stage in a different state, to cover every stepper row at once. */
export function pipelineView(stages?: PipelineStageView[]): LessonPipelineView {
  return {
    lessonId: LESSON_ID,
    serverTime: '2026-09-24T15:10:00.000Z',
    branch: {
      stage: 'lesson_analysis',
      status: 'failed',
      stages: stages ?? [
        stage({ stage: 'recording', status: 'completed', startedAt: '2026-09-24T14:10:03.000Z', finishedAt: '2026-09-24T15:03:30.000Z' }),
        stage({ stage: 'transcription', status: 'completed', startedAt: '2026-09-24T15:03:31.000Z', finishedAt: '2026-09-24T15:04:35.000Z' }),
        stage({ stage: 'excerpt_selection', status: 'completed', startedAt: '2026-09-24T15:04:35.000Z', finishedAt: '2026-09-24T15:04:36.000Z' }),
        stage({
          stage: 'pronunciation_assessment',
          status: 'completed',
          startedAt: '2026-09-24T15:04:36.000Z',
          finishedAt: '2026-09-24T15:05:40.000Z',
          progress: { done: 12, total: 12 },
        }),
        stage({
          stage: 'lesson_analysis',
          status: 'failed',
          startedAt: '2026-09-24T15:05:40.000Z',
          finishedAt: '2026-09-24T15:32:10.000Z',
          lastAttemptAt: '2026-09-24T14:32:00.000Z',
          reasonCode: 'analysis_invalid_output',
          reason: 'The analysis came back malformed twice.',
          providerMessage: 'Schema validation failed at /errors/3',
          retryable: true,
        }),
      ],
    },
  };
}

export { stage as pipelineStage };

export function recordingView(overrides: Partial<LessonRecordingView['mine']> = {}): LessonRecordingView {
  return {
    lessonId: LESSON_ID,
    lessonStatus: 'ended',
    endReason: 'ended_by_participant',
    startedAt: '2026-09-24T14:10:03.000Z',
    endedAt: '2026-09-24T15:02:41.000Z',
    durationSeconds: 3158,
    recordingStatus: 'recorded',
    storageBytes: 48_213_504,
    mine: {
      recordingStatus: 'complete',
      audioBytes: 24_000_000,
      capturedSeconds: 3158,
      audioDurationSeconds: 3158,
      recordingStartedAt: '2026-09-24T14:10:03.000Z',
      branch: null,
      ...overrides,
    },
  };
}

export const ok = <T>(data: T) => ({ ok: true as const, data });
export const failed = { ok: false as const, status: 500, code: null };
