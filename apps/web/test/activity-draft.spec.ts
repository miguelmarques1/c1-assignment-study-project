import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACTIVITY_DRAFT_PREFIX,
  clearDraft,
  DRAFT_UPDATED_NOTICE,
  firstUnansweredIndex,
  loadDraft,
  reconcileDraft,
  saveDraft,
  type ActivityDraft,
} from '@/lib/activity-draft';
import { ACTIVITY_ID, answerOf, ATTEMPT_ID, fiveQuestions, FINGERPRINT, openAttempt, submittedView, viewOf } from './fixtures/activities';

function draft(overrides: Partial<ActivityDraft> = {}): ActivityDraft {
  return {
    activityId: ACTIVITY_ID,
    attemptId: ATTEMPT_ID,
    fingerprint: FINGERPRINT,
    answers: [answerOf.mc(0, 1), answerOf.fill(1, 'had heard')],
    activeSeconds: 42,
    pendingSubmission: false,
    savedAt: '2026-10-02T07:40:00.000Z',
    ...overrides,
  };
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('activity draft storage', () => {
  it('round_trips_a_draft_and_clears_it', () => {
    saveDraft(draft());
    expect(loadDraft([ACTIVITY_ID])).toEqual(draft());
    clearDraft([ACTIVITY_ID]);
    expect(loadDraft([ACTIVITY_ID])).toBeNull();
  });

  it('finds_the_newest_draft_under_any_id_of_the_lineage', () => {
    saveDraft(draft({ activityId: 'old-id', savedAt: '2026-10-01T00:00:00.000Z', answers: [] }));
    saveDraft(draft({ activityId: ACTIVITY_ID, savedAt: '2026-10-02T00:00:00.000Z' }));
    expect(loadDraft(['old-id', ACTIVITY_ID])?.activityId).toBe(ACTIVITY_ID);
  });

  it('corrupt_json_is_discarded_not_trusted', () => {
    window.localStorage.setItem(`${ACTIVITY_DRAFT_PREFIX}${ACTIVITY_ID}`, '{not json');
    expect(loadDraft([ACTIVITY_ID])).toBeNull();
    expect(window.localStorage.getItem(`${ACTIVITY_DRAFT_PREFIX}${ACTIVITY_ID}`)).toBeNull();
    window.localStorage.setItem(`${ACTIVITY_DRAFT_PREFIX}${ACTIVITY_ID}`, JSON.stringify({ ...draft(), answers: [{ index: 9, format: 'nope' }] }));
    expect(loadDraft([ACTIVITY_ID])).toBeNull();
  });

  it('blocked_storage_never_throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadDraft([ACTIVITY_ID])).toBeNull();
    expect(() => saveDraft(draft())).not.toThrow();
    expect(() => clearDraft([ACTIVITY_ID])).not.toThrow();
  });

  it('opens_on_the_first_unanswered_scored_question', () => {
    const questions = fiveQuestions();
    expect(firstUnansweredIndex(questions, [])).toBe(0);
    expect(firstUnansweredIndex(questions, [answerOf.mc(0, 1), answerOf.fill(1, 'x')])).toBe(2);
    expect(firstUnansweredIndex(questions, [0, 1, 2, 3, 4].map((index) => answerOf.mc(index, 0)))).toBe(4);
  });
});

describe('reconcileDraft', () => {
  it('submitted_on_the_server_discards_the_draft', () => {
    expect(reconcileDraft(submittedView(), draft())).toEqual({ kind: 'results' });
  });

  it('a_skipped_activity_discards_the_draft', () => {
    expect(reconcileDraft(viewOf({ state: 'skipped' }), draft())).toEqual({ kind: 'unavailable' });
    expect(reconcileDraft(viewOf({ readOnly: true }), draft())).toEqual({ kind: 'unavailable' });
  });

  it('a_matching_attempt_restores', () => {
    const view = viewOf({ state: 'in_progress', attempt: openAttempt() });
    const outcome = reconcileDraft(view, draft());
    expect(outcome).toMatchObject({ kind: 'restore', attemptId: ATTEMPT_ID, resumeSubmit: false });
  });

  it('a_draft_without_attempt_adopts_the_open_one', () => {
    const view = viewOf({ state: 'in_progress', attempt: openAttempt() });
    const outcome = reconcileDraft(view, draft({ attemptId: null }));
    expect(outcome).toMatchObject({ kind: 'restore', attemptId: ATTEMPT_ID });
    expect(outcome.kind === 'restore' && outcome.draft.attemptId).toBe(ATTEMPT_ID);
  });

  it('with_no_attempt_a_draft_without_one_restores_and_a_stale_one_is_discarded', () => {
    expect(reconcileDraft(viewOf(), draft({ attemptId: null }))).toMatchObject({ kind: 'restore', attemptId: null });
    expect(reconcileDraft(viewOf(), draft({ attemptId: ATTEMPT_ID }))).toEqual({ kind: 'fresh', attemptId: null, notice: null });
  });

  it('a_stale_attempt_id_discards', () => {
    const view = viewOf({ state: 'in_progress', attempt: openAttempt() });
    expect(reconcileDraft(view, draft({ attemptId: 'b1b2b3b4-0000-4000-8000-000000000000' }))).toEqual({ kind: 'fresh', attemptId: ATTEMPT_ID, notice: null });
  });

  it('a_changed_fingerprint_discards_with_a_notice', () => {
    const view = viewOf({ state: 'in_progress', attempt: openAttempt(), fingerprint: 'e'.repeat(64) });
    expect(reconcileDraft(view, draft())).toEqual({ kind: 'fresh', attemptId: ATTEMPT_ID, notice: DRAFT_UPDATED_NOTICE });
  });

  it('a_pending_submission_resumes_sending', () => {
    const view = viewOf({ state: 'in_progress', attempt: openAttempt() });
    expect(reconcileDraft(view, draft({ pendingSubmission: true }))).toMatchObject({ kind: 'restore', resumeSubmit: true });
  });

  it('no_draft_starts_fresh_on_the_open_attempt', () => {
    const view = viewOf({ state: 'in_progress', attempt: openAttempt() });
    expect(reconcileDraft(view, null)).toEqual({ kind: 'fresh', attemptId: ATTEMPT_ID, notice: null });
  });
});
