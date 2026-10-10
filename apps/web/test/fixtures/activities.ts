import type {
  ActivityView,
  ObjectiveAnswer,
  ObjectiveQuestionView,
  ObjectiveResult,
  ObjectiveView,
  PlanActivityKind,
  PlanActivityState,
  PlanActivityView,
} from '@english-quest/shared';

export const FINGERPRINT = 'f'.repeat(64);
export const ACTIVITY_ID = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';
export const OTHER_ACTIVITY_ID = '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f';
export const ATTEMPT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

export function planEntry(overrides: Partial<PlanActivityView> = {}): PlanActivityView {
  return {
    id: ACTIVITY_ID,
    day: 2,
    position: 1,
    kind: 'reading',
    contentItemId: '9f1c4d7e-3b2a-4f51-9d0c-7a6b5e4c3d22',
    title: 'The housing debate',
    estimatedMinutes: 7,
    targetTags: [],
    rationale: 'Because.',
    isReview: false,
    carriedOver: false,
    state: 'pending',
    startedAt: null,
    completedAt: null,
    skippedAt: null,
    skipReason: null,
    rating: null,
    notUseful: false,
    ...overrides,
  };
}

/** Five questions: multiple choice, fill-in-the-blank, multiple choice, fill-in-the-blank, multiple choice. */
export function fiveQuestions(): ObjectiveQuestionView[] {
  return [
    { index: 0, format: 'multiple_choice', prompt: 'What does the writer blame?', options: ['Rates', 'The council', 'Builders', 'Policy'] },
    { index: 1, format: 'fill_blank', prompt: 'If the council ___ the tenants, it would survive.', before: 'If the council ', after: ' the tenants, it would survive.', blankLength: 15 },
    { index: 2, format: 'multiple_choice', prompt: 'Which tone?', options: ['Detached', 'Exasperated', 'Celebratory', 'Nostalgic'] },
    { index: 3, format: 'fill_blank', prompt: '___ the tenants been heard, it would differ.', before: '', after: ' the tenants been heard, it would differ.', blankLength: 4 },
    { index: 4, format: 'multiple_choice', prompt: 'Which title?', options: ['A', 'B', 'C', 'D'] },
  ];
}

export const answerOf = {
  mc: (index: number, optionIndex: number): ObjectiveAnswer => ({ index, format: 'multiple_choice', optionIndex }),
  fill: (index: number, text: string): ObjectiveAnswer => ({ index, format: 'fill_blank', text }),
};

export function resultOf(overrides: Partial<ObjectiveResult> = {}): ObjectiveResult {
  return {
    scoreCorrect: 3,
    scoreTotal: 4,
    unscoredCount: 1,
    timeSpentSeconds: 120,
    submittedAt: '2026-10-02T07:44:44.000Z',
    questions: [
      { index: 0, format: 'multiple_choice', prompt: 'What does the writer blame?', outcome: 'correct', response: 'The council', correctAnswer: 'The council', acceptedAnswers: [], explanation: 'Paragraph two.', unscoredReason: null },
      { index: 1, format: 'fill_blank', prompt: 'If the council ___ the tenants, it would survive.', outcome: 'incorrect', response: 'would have heard', correctAnswer: 'had listened to', acceptedAnswers: ['had listened to', 'had heard'], explanation: "A third conditional puts the past perfect in the if-clause.", unscoredReason: null },
      { index: 2, format: 'multiple_choice', prompt: 'Which tone?', outcome: 'correct', response: 'Exasperated', correctAnswer: 'Exasperated', acceptedAnswers: [], explanation: 'Frustration.', unscoredReason: null },
      { index: 3, format: 'fill_blank', prompt: '___ the tenants been heard, it would differ.', outcome: 'correct', response: 'Had', correctAnswer: 'Had', acceptedAnswers: ['Had'], explanation: 'Inversion.', unscoredReason: null },
      { index: 4, format: 'unscored', prompt: 'Put these in order.', outcome: 'unscored', response: null, correctAnswer: null, acceptedAnswers: [], explanation: null, unscoredReason: 'format_unavailable' },
    ],
    ...overrides,
  };
}

export interface ViewOptions {
  kind?: PlanActivityKind;
  state?: PlanActivityState;
  readOnly?: boolean;
  questions?: ObjectiveQuestionView[];
  passage?: ObjectiveView['item']['passage'];
  hasAudio?: boolean;
  attempt?: ObjectiveView['attempt'];
  result?: ObjectiveResult | null;
  runnable?: boolean;
  fingerprint?: string;
  skipReason?: string | null;
  rating?: ActivityView['activity']['rating'];
  session?: PlanActivityView[];
  lineage?: string[];
}

export function viewOf(options: ViewOptions = {}): ActivityView {
  const kind = options.kind ?? 'reading';
  const state = options.state ?? 'pending';
  const self = planEntry({ id: ACTIVITY_ID, kind, state });
  const activities = options.session ?? [self, planEntry({ id: OTHER_ACTIVITY_ID, position: 2, kind: 'grammar', title: 'Regrets', state: 'pending' })];
  const type = kind === 'listening' || kind === 'reading' || kind === 'vocabulary' || kind === 'grammar' || kind === 'error_review' ? kind : 'reading';
  return {
    serverTime: '2026-10-02T07:41:10.000Z',
    activity: {
      id: ACTIVITY_ID,
      lineage: options.lineage ?? [ACTIVITY_ID],
      planId: '4f1c2b3a-5d6e-4f70-8a91-b2c3d4e5f607',
      planStatus: options.readOnly ? 'archived' : 'active',
      readOnly: options.readOnly ?? false,
      kind,
      title: 'The housing debate',
      estimatedMinutes: 7,
      targetTags: [],
      rationale: 'Because.',
      state,
      startedAt: state === 'pending' ? null : '2026-10-02T07:38:02.000Z',
      completedAt: state === 'completed' ? '2026-10-02T07:44:44.000Z' : null,
      skippedAt: state === 'skipped' ? '2026-10-02T07:44:44.000Z' : null,
      skipReason: options.skipReason ?? null,
      rating: options.rating ?? null,
      notUseful: false,
      planCompletionPercent: 21,
    },
    session: { day: 2, position: 1, count: activities.length, activities },
    objective: {
      runnable: options.runnable ?? true,
      item: {
        type,
        title: 'The housing debate',
        topic: 'housing',
        cefrLevel: 'C1',
        accent: null,
        durationSeconds: null,
        passage: options.passage === undefined ? { kind: 'text', text: 'Had the council listened to its tenants, the scheme would not have collapsed.' } : options.passage,
        hasAudio: options.hasAudio ?? false,
        source: null,
        questionsFingerprint: options.fingerprint ?? FINGERPRINT,
        questions: options.questions ?? fiveQuestions(),
      },
      attempt: options.attempt ?? null,
      result: options.result ?? null,
    },
  };
}

export function openAttempt(id = ATTEMPT_ID): NonNullable<ObjectiveView['attempt']> {
  return { id, status: 'open', startedAt: '2026-10-02T07:38:02.000Z', submittedAt: null };
}

export function submittedView(overrides: ViewOptions = {}): ActivityView {
  return viewOf({
    state: 'completed',
    attempt: { id: ATTEMPT_ID, status: 'submitted', startedAt: '2026-10-02T07:38:02.000Z', submittedAt: '2026-10-02T07:44:44.000Z' },
    result: resultOf(),
    ...overrides,
  });
}
