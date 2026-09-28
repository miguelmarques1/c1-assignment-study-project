import { join } from 'node:path';

/** At most this many scored attempts per task (PRD, A10). */
export const SPEAKING_MAX_ATTEMPTS = 3;

/** The PRD's recording cap, in milliseconds. */
export const SPEAKING_MAX_RECORDING_MS = 120_000;

/** A9's tolerance over the cap for encoder rounding. */
export const SPEAKING_DURATION_TOLERANCE_MS = 1_000;
export const SPEAKING_MAX_DURATION_MS = SPEAKING_MAX_RECORDING_MS + SPEAKING_DURATION_TOLERANCE_MS;

/** Below this, a clip is stored as `discarded` without any Azure call (A30). */
export const SPEAKING_MIN_DURATION_MS = 2_000;

/** Fewer recognized words than this discards the attempt without scoring (PRD). */
export const SPEAKING_MIN_RECOGNIZED_WORDS = 10;

/** The upload body cap: 120 s at 32,000 B/s plus the WAV header (A29). */
export const SPEAKING_MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export const READ_ALOUD_WORDS = { min: 25, max: 60 } as const;
export const OPEN_RESPONSE_TARGET_SECONDS = { min: 30, max: 90 } as const;

/** Segmentation past the REST API's 30 s cap (A5). */
export const SEGMENT_MAX_MS = 29_000;
export const SPEECH_SPAN_PADDING_MS = 300;

/** Two more attempts, inline, before a scoring pass gives up (A13). */
export const SPEAKING_RETRY_DELAYS: readonly number[] = [2_000, 8_000];
/** Replaces the inline retry delays above; a test shortens them to milliseconds. */
export const SPEAKING_RETRY_DELAYS_OVERRIDE = Symbol('SPEAKING_RETRY_DELAYS_OVERRIDE');

/** The whole scoring pass gives up past this budget (A13). */
export const SCORING_BUDGET_MS = 120_000;
/** A `scoring` row older than this is converted to `failed`/`interrupted` (A13). */
export const SCORING_LEASE_MS = 180_000;

/** A passage or prompt used within this many days is deprioritized (A4). */
export const RECENT_TASK_DAYS = 14;

/** Every `CredentialUsage` row a speaking activity writes carries one of these (A29's audit labels). */
export const SPEAKING_USAGE_FEATURE = {
  readAloud: 'F18_read_aloud',
  openResponse: 'F18_open_response',
} as const;

/** Where the corpus is read from at boot (A2). */
export const SPEAKING_TASKS_PATH = join(process.cwd(), 'rules', 'speaking-tasks.yaml');

/** Where an attempt's audio lives (A8): one folder per attempt under the PRD's prefix. */
export function attemptAudioKey(activityId: string, userId: string, attemptId: string): string {
  return `activities/${activityId}/${userId}/${attemptId}/audio.wav`;
}

/** Where the scorer stages a recording and its segments for one attempt. */
export const SPEAKING_WORK_ROOT = Symbol('SPEAKING_WORK_ROOT');

/** Attempt failure and discard sentences (spec §5), keyed by `SpeakingFailureCode`. */
export const SPEAKING_FAILURE_MESSAGES = {
  not_enough_speech: 'We could not hear enough speech in that recording.',
  azure_key_missing: 'Add your Azure Speech key, then re-score this recording.',
  azure_key_rejected: 'Your Azure Speech key was rejected. Update it in settings, then re-score this recording.',
  azure_quota: 'Azure Speech quota exceeded. Re-score this recording later.',
  azure_region_unsupported: 'Pronunciation assessment is not available in your Azure Speech region.',
  service_error: 'Scoring failed. Your recording is saved — re-score when ready.',
  interrupted: 'Scoring was interrupted. Your recording is saved — re-score when ready.',
  internal_error: 'Something went wrong while scoring. Your recording is saved — re-score when ready.',
  audio_rejected: 'Azure Speech could not process this recording.',
  audio_missing: 'This recording is no longer available.',
} as const;

/** Whether a failure code leaves the attempt eligible for `POST /speaking/attempts/:id/rescore` (spec §5). */
export const SPEAKING_RESCORABLE: Record<keyof typeof SPEAKING_FAILURE_MESSAGES, boolean> = {
  not_enough_speech: false,
  azure_key_missing: true,
  azure_key_rejected: true,
  azure_quota: true,
  azure_region_unsupported: true,
  service_error: true,
  interrupted: true,
  internal_error: true,
  audio_rejected: false,
  audio_missing: false,
};

/** The Azure-key gate's sentence (A12), shown by both clients. */
export const SPEAKING_AZURE_KEY_MESSAGE = 'Add your Azure Speech key to use speaking activities.';
