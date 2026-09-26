export { LESSON_LIST_DEFAULT_LIMIT, LESSON_LIST_MAX_LIMIT } from '@english-quest/shared';

/**
 * Lessons that started and ended (F19, A6). `waiting` and `live` belong to
 * the dashboard's classroom hero, and an `abandoned` lesson never happened.
 */
export const HISTORY_LESSON_STATUSES = ['ended', 'ended_unexpectedly'] as const;

/** The status-reason sentences the history builds itself (rows 1, 2 and 5 of the spec's precedence table). */
export const LESSON_STATUS_REASONS = {
  tooShort: 'Too short to analyze (minimum 3 minutes)',
  recordingFailed: 'This lesson was not recorded, so it could not be analyzed.',
  noBranch: 'You were not in this lesson after it started, so it has no result for you.',
  /** A blocked stage row always carries its own sentence; this covers a row that is somehow missing. */
  blockedFallback: 'Blocked — add your key in Settings to continue.',
} as const;

export const HEADLINE_SENTENCES = {
  firstResult: 'Your first result',
  noChange: 'No change since your previous lesson',
} as const;

/** How many changes a headline names at most. */
export const HEADLINE_MAX_CHANGES = 2;
