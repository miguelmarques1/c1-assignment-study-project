import { objectiveAnswerSchema, type ActivityView, type ObjectiveAnswer, type ObjectiveQuestionView } from '@english-quest/shared';

/**
 * A learner's answers, kept on this device as they are given (A6), so an
 * interrupted activity resumes where it stopped and a submission that could
 * not be sent is never lost. Cross-device resume is the Full scope.
 */
export interface ActivityDraft {
  /** The plan activity id the draft was written under; a carried copy finds it through its lineage. */
  activityId: string;
  attemptId: string | null;
  /** Of the questions these answers were given to. */
  fingerprint: string;
  answers: ObjectiveAnswer[];
  activeSeconds: number;
  pendingSubmission: boolean;
  savedAt: string;
}

export const ACTIVITY_DRAFT_PREFIX = 'eq.activity.draft.';
export const DRAFT_UPDATED_NOTICE = 'This activity was updated, so your answers were cleared.';

function keyOf(activityId: string): string {
  return `${ACTIVITY_DRAFT_PREFIX}${activityId}`;
}

/** Storage can be blocked (private windows, site settings), so every access is guarded. */
function store(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function parse(raw: string): ActivityDraft | null {
  try {
    const value = JSON.parse(raw) as Partial<ActivityDraft> | null;
    if (
      !value ||
      typeof value.activityId !== 'string' ||
      typeof value.fingerprint !== 'string' ||
      !(value.attemptId === null || typeof value.attemptId === 'string') ||
      typeof value.activeSeconds !== 'number' ||
      typeof value.pendingSubmission !== 'boolean' ||
      typeof value.savedAt !== 'string' ||
      !Array.isArray(value.answers)
    ) {
      return null;
    }
    const answers = value.answers.map((answer) => objectiveAnswerSchema.safeParse(answer));
    if (answers.some((answer) => !answer.success)) {
      return null;
    }
    return {
      activityId: value.activityId,
      attemptId: value.attemptId,
      fingerprint: value.fingerprint,
      answers: answers.map((answer) => (answer as { success: true; data: ObjectiveAnswer }).data),
      activeSeconds: value.activeSeconds,
      pendingSubmission: value.pendingSubmission,
      savedAt: value.savedAt,
    };
  } catch {
    return null;
  }
}

/** The newest draft stored under any id of the activity's lineage. A corrupt entry is removed rather than trusted. */
export function loadDraft(lineage: readonly string[]): ActivityDraft | null {
  const storage = store();
  if (!storage) {
    return null;
  }
  let newest: ActivityDraft | null = null;
  for (const id of lineage) {
    try {
      const raw = storage.getItem(keyOf(id));
      if (raw === null) {
        continue;
      }
      const draft = parse(raw);
      if (!draft) {
        storage.removeItem(keyOf(id));
      } else if (!newest || draft.savedAt > newest.savedAt) {
        newest = draft;
      }
    } catch {
      // A blocked read behaves like no draft.
    }
  }
  return newest;
}

export function saveDraft(draft: ActivityDraft): void {
  try {
    store()?.setItem(keyOf(draft.activityId), JSON.stringify(draft));
  } catch {
    // Quota or blocked storage: the answers stay on screen, just not on disk.
  }
}

export function clearDraft(lineage: readonly string[]): void {
  const storage = store();
  for (const id of lineage) {
    try {
      storage?.removeItem(keyOf(id));
    } catch {
      // Nothing to clear if storage is blocked.
    }
  }
}

export type ReconcileOutcome =
  | { kind: 'results' }
  | { kind: 'unavailable' }
  /** Start at the first question; the draft (if any) is discarded. */
  | { kind: 'fresh'; attemptId: string | null; notice: string | null }
  | { kind: 'restore'; draft: ActivityDraft; attemptId: string | null; resumeSubmit: boolean };

/**
 * What to do with a local draft given the server's view (the §5 rule table,
 * identical on both clients). Pure.
 */
export function reconcileDraft(view: ActivityView, draft: ActivityDraft | null): ReconcileOutcome {
  const objective = view.objective;
  if (!objective || objective.result) {
    return { kind: 'results' };
  }
  const openAttempt = objective.attempt?.status === 'open' ? objective.attempt : null;
  if (view.activity.state === 'skipped' || (view.activity.readOnly && !openAttempt)) {
    return { kind: 'unavailable' };
  }
  const attemptId = openAttempt?.id ?? null;

  if (!draft) {
    return { kind: 'fresh', attemptId, notice: null };
  }
  if (draft.fingerprint !== objective.item.questionsFingerprint) {
    return { kind: 'fresh', attemptId, notice: DRAFT_UPDATED_NOTICE };
  }
  if (attemptId === null) {
    // A draft that names an attempt the server no longer has was abandoned.
    return draft.attemptId === null
      ? { kind: 'restore', draft, attemptId: null, resumeSubmit: draft.pendingSubmission }
      : { kind: 'fresh', attemptId: null, notice: null };
  }
  if (draft.attemptId !== null && draft.attemptId !== attemptId) {
    return { kind: 'fresh', attemptId, notice: null };
  }
  return { kind: 'restore', draft: { ...draft, attemptId }, attemptId, resumeSubmit: draft.pendingSubmission };
}

/**
 * The question to open on: the first scored one with no answer yet, or the
 * last question when everything is answered (where `Submit answers` waits).
 */
export function firstUnansweredIndex(questions: readonly ObjectiveQuestionView[], answers: readonly ObjectiveAnswer[]): number {
  const answered = new Set(answers.map((answer) => answer.index));
  const open = questions.find((question) => question.format !== 'unscored' && !answered.has(question.index));
  return open ? questions.indexOf(open) : Math.max(questions.length - 1, 0);
}
