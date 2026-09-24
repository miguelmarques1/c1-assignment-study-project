/**
 * Fixed recording values, kept here once so a threshold is never re-spelled at
 * a second call site (the orchestrator, the finalizer, the classifier, tests).
 * All constants per the spec — the PRD states these as fixed capabilities,
 * mirroring F05's reading where only `LESSON_MAX_PARTICIPANTS` is configuration.
 */

/** The PRD's minimum processable lesson duration. Below this: `too_short`, no branches. */
export const MIN_LESSON_DURATION_SECONDS = 180;

/** The PRD's minimum processable *participant* duration — a late joiner's own captured audio. */
export const MIN_PARTICIPANT_CAPTURED_SECONDS = 180;

/** "Exceed 10 KB" read as strictly more than 10,240 bytes. */
export const MIN_AUDIO_BYTES = 10_240;

/** How long a failed egress start attempt waits before its single retry. */
export const EGRESS_START_RETRY_DELAY_MS = 1_000;

/** One retry on a failed start: two attempts total. */
export const MAX_EGRESS_START_ATTEMPTS = 2;

/** One restart on an unexpected end. */
export const MAX_EGRESS_RESTARTS = 1;

/** How long finalization waits for every segment to report ended before reconciling via `listEgress`. */
export const EGRESS_SETTLE_SECONDS = 120;

/** The PRD's "verification retries for 2 minutes" before `storage_unavailable`. */
export const STORAGE_UNAVAILABLE_WINDOW_SECONDS = 120;

/** The finalization sweeper's tick — a quarter of the tighter (segment-settle) budget is unnecessary here; 5s keeps latency low without hammering Postgres. */
export const RECORDING_FINALIZATION_INTERVAL_MS = 5_000;

/** How long a finalization pass holds its lease — long enough to survive one tick, short enough that a crashed pass is retried soon. */
export const RECORDING_LEASE_MS = 30_000;

/** The assembled per-participant file's codec parameters. */
export const ASSEMBLED_AUDIO_SAMPLE_RATE = 48_000;
export const ASSEMBLED_AUDIO_CHANNELS = 1;
export const ASSEMBLED_AUDIO_BITRATE = '48k';

/** Where a single egress writes before assembly, per the spec's object layout. */
export function segmentObjectKey(lessonId: string, userId: string, segmentId: string): string {
  return `lessons/${lessonId}/${userId}/segments/${segmentId}.ogg`;
}

/** The verified, assembled object F08 and F10 read — one per participant per lesson. */
export function audioObjectKey(lessonId: string, userId: string): string {
  return `lessons/${lessonId}/${userId}/audio.ogg`;
}
