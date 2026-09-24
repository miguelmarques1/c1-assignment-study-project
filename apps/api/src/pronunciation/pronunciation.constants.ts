import type { StageRetryPolicy } from '../pipeline/pipeline-stage.handler';

/**
 * Unclassified failures only (a database fault, a crash mid-run): every
 * classified outcome (a rejected key, quota, a bad slice) is decided inside
 * the run and never retried on this schedule. Completed excerpts are never
 * redone on a retry, since their rows are already `assessed`.
 */
export const PRONUNCIATION_RETRY_POLICY: StageRetryPolicy = {
  attempts: 3,
  delaysMs: [60_000, 300_000],
};

/** Two more attempts per excerpt, inline, before it is marked `failed` and the loop moves on. */
export const PRONUNCIATION_EXCERPT_RETRY_DELAYS: readonly number[] = [2_000, 8_000];

/** Replaces the inline per-excerpt retry delays above. A test shortens 2 s / 8 s to milliseconds. */
export const PRONUNCIATION_EXCERPT_RETRY_DELAYS_OVERRIDE = Symbol('PRONUNCIATION_EXCERPT_RETRY_DELAYS_OVERRIDE');

/** 16 kHz mono, the REST API's canonical input. */
export const PRONUNCIATION_CLIP_SAMPLE_RATE = 16_000;

/** Below this, a sliced clip is treated as empty — ffmpeg produced a header with no usable audio. */
export const PRONUNCIATION_MIN_CLIP_BYTES = 1_000;

/**
 * A clip more than this much shorter than its requested range is treated as
 * a failed slice — a range that runs off the end of the source, which
 * ffmpeg does not always fail on outright. Generous above normal encoding
 * rounding (the cross-feature criterion's own tolerance is 20 ms).
 */
export const PRONUNCIATION_CLIP_DURATION_TOLERANCE_MS = 250;

/** `assessed / selected` at or above this completes the stage; below it, the stage fails. */
export const PRONUNCIATION_MIN_ASSESSED_SHARE = 0.6;

/** Azure's own boundary for a word's `Mispronunciation` — a phoneme instance below this counts as a failure. */
export const PHONEME_FAILURE_THRESHOLD = 60;

/** A phoneme needs at least this many failing instances in the lesson to be ranked — one bad reading is noise. */
export const WORST_PHONEME_MIN_OCCURRENCES = 2;

export const WORST_PHONEMES_LIMIT = 5;
export const WORST_WORDS_LIMIT = 10;

/** Every `CredentialUsage` row this stage writes carries this feature label. */
export const PRONUNCIATION_USAGE_FEATURE = 'F10_lesson_pronunciation';

/**
 * Where the downloaded track and its sliced clips live for one run.
 * Production leaves it at `os.tmpdir()`; a test overrides it with a
 * per-suite directory it can assert is empty afterward.
 */
export const PRONUNCIATION_WORK_ROOT = Symbol('PRONUNCIATION_WORK_ROOT');

export const PRONUNCIATION_REASONS = {
  tooFewAssessed: (assessed: number, selected: number) =>
    `Too few excerpts could be assessed (${assessed} of ${selected}).`,
  quotaExhausted: 'Azure Speech quota was exhausted during assessment.',
  audioUnprocessable: 'Audio could not be processed for assessment.',
  storageUnreadable: 'Recording could not be read from storage.',
  regionUnsupported: 'Pronunciation assessment is not available in your Azure Speech region.',
} as const;

export const PRONUNCIATION_NOTES = {
  sparse: (assessedCount: number) =>
    `Based on only ${assessedCount} excerpts — this score is less reliable than usual.`,
  partial: (assessedCount: number, excerptCount: number) =>
    `Based on ${assessedCount} of ${excerptCount} excerpts; some could not be assessed.`,
  quota: 'Azure Speech quota was exhausted during assessment.',
} as const;
