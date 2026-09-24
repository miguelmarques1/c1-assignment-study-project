import type { BlockedReasonCode, TranscriptionFailureCode } from '@english-quest/shared';

import type { StageRetryPolicy } from '../pipeline/pipeline-stage.handler';

/** The PRD's schedule: three retries, at 30 seconds, 2 minutes and 8 minutes. */
export const TRANSCRIPTION_RETRY_POLICY: StageRetryPolicy = {
  attempts: 4,
  delaysMs: [30_000, 120_000, 480_000],
};

/** The label every lesson transcription is audited under in `credential_usage`. */
export const TRANSCRIPTION_USAGE_FEATURE = 'F08_lesson_transcription';

/**
 * The sentences this stage shows. The three the PRD pins (quota, storage,
 * no speech, and the two blocked states) are asserted by the acceptance
 * tests, so changing one is a product decision, not a refactor.
 */
export const TRANSCRIPTION_REASONS: Record<BlockedReasonCode | TranscriptionFailureCode, string> = {
  credential_missing: 'Blocked — add your Azure Speech key to continue.',
  credential_rejected: 'Your Azure Speech key was rejected. Update it in settings to resume.',
  credential_unreadable: 'Your stored Azure Speech key could not be read. Enter it again in settings to resume.',
  transcription_quota_exceeded: 'Azure Speech quota exceeded.',
  transcription_service_error: 'Azure Speech could not transcribe this recording.',
  transcription_storage_unreadable: 'Recording could not be read from storage.',
  transcription_no_speech: 'No speech detected in this recording.',
  transcription_audio_rejected: "Azure Speech could not process this recording's audio.",
  transcription_region_unsupported: 'Fast transcription is not available in your Azure Speech region.',
};
