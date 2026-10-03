import { WRITING_DAILY_CORRECTION_LIMIT, WRITING_LIMIT_WINDOW_HOURS, type WritingLimitView } from '@english-quest/shared';

const WINDOW_MS = WRITING_LIMIT_WINDOW_HOURS * 60 * 60 * 1000;

/**
 * The rolling 24-hour correction limit (A14): `requestedAt` is every counted
 * request in the last 24 hours (every accepted submission or resubmission,
 * whatever its outcome). `resetsAt` is set only once the limit is reached —
 * the moment the oldest of those requests turns 24 hours old.
 */
export function limitState(requestedAt: readonly Date[], now: Date): WritingLimitView {
  const windowStart = now.getTime() - WINDOW_MS;
  const inWindow = requestedAt.filter((at) => at.getTime() > windowStart);
  const used = inWindow.length;
  if (used < WRITING_DAILY_CORRECTION_LIMIT) {
    return { max: WRITING_DAILY_CORRECTION_LIMIT, used, resetsAt: null };
  }
  const oldest = inWindow.reduce((min, at) => (at < min ? at : min), inWindow[0]!);
  return {
    max: WRITING_DAILY_CORRECTION_LIMIT,
    used,
    resetsAt: new Date(oldest.getTime() + WINDOW_MS).toISOString(),
  };
}

/** The window's start for a given `now` — what the repository filters `requested_at` against. */
export function limitWindowStart(now: Date): Date {
  return new Date(now.getTime() - WINDOW_MS);
}
