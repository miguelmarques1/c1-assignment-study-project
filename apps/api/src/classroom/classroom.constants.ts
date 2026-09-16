/**
 * Fixed classroom values, kept here once so a threshold is never re-spelled
 * at a second call site (join orchestration, the lifecycle sweeper, tests).
 */

/** One persistent room in the MVP; simultaneous rooms are out of scope. */
export const CLASSROOM_ROOM_NAME = 'classroom-main';

/** A constant per the spec — only the participant cap is configuration. */
export const CLASSROOM_TOKEN_TTL_SECONDS = 6 * 60 * 60;

/** The PRD's grace period before a lesson with nobody connected is closed. */
export const CLASSROOM_ALL_DISCONNECTED_GRACE_SECONDS = 60;

/** The PRD's maximum lesson duration, enforced by the sweeper. */
export const CLASSROOM_MAX_DURATION_MINUTES = 120;

/** A quarter of the tighter (60s) budget, so worst-case lateness stays bounded. */
export const CLASSROOM_SWEEPER_INTERVAL_MS = 15_000;
