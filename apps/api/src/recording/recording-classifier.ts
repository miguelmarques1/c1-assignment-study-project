import type {
  LessonRecordingStatus,
  ParticipantRecordingStatus,
  RecordingFailureCode,
} from '@english-quest/shared';

import { MIN_LESSON_DURATION_SECONDS, MIN_PARTICIPANT_CAPTURED_SECONDS } from './recording.constants';

export const FAILURE_REASONS: Record<RecordingFailureCode, string> = {
  recording_failed_to_start: 'Recording failed to start.',
  recording_missing: 'Recording is empty or missing.',
  recording_too_short: 'Recording is shorter than 3 minutes, which is too short to analyze.',
  recording_assembly_failed: 'Recording could not be processed.',
};

export interface ParticipantClassificationInput {
  /** The live status the orchestrator left this participant at — never itself an output of classification. */
  liveStatus: ParticipantRecordingStatus;
  /** Whether any segment for this participant was ever created — false means the microphone was never published. */
  assemblyAttempted: boolean;
  /** Sum of milliseconds actually captured across every active/complete segment (excludes filled gaps). */
  capturedMs: number;
  /** True if any segment for this participant ever ended unexpectedly (a mid-lesson egress failure that was, or wasn't, restarted). */
  hadUnexpectedEnd: boolean;
  /** True if ffmpeg itself failed while assembling this participant's segments. */
  assemblyFailed: boolean;
  /** Set once assembly, upload and verification all succeeded and the object exceeds the 10 KB floor. */
  verifiedAudio: { bytes: number; durationMs: number } | null;
}

export interface ParticipantClassification {
  recordingStatus: ParticipantRecordingStatus;
  audioBytes: number | null;
  audioDurationMs: number | null;
  capturedMs: number;
  failureCode: RecordingFailureCode | null;
  failureReason: string | null;
  retryable: boolean;
  requiresFallbackPlan: boolean;
  /** Whether this participant's branch should reach `queued` — F08's `PipelineLaunchPort` is called only when true. */
  launches: boolean;
}

function failed(
  input: ParticipantClassificationInput,
  code: RecordingFailureCode,
  retryable: boolean,
  recordingStatus: ParticipantRecordingStatus = 'missing',
): ParticipantClassification {
  return {
    recordingStatus,
    audioBytes: null,
    audioDurationMs: null,
    capturedMs: input.capturedMs,
    failureCode: code,
    failureReason: FAILURE_REASONS[code],
    retryable,
    requiresFallbackPlan: true,
    launches: false,
  };
}

/**
 * Pure classification rules: given what actually happened to one
 * participant's recording, decides their final status, whether a failure
 * code applies, whether a retry could still find something, and whether a
 * fallback study plan should be requested. Called once per participant by
 * the finalizer — never touches storage, the database or the network itself.
 */
export function classifyParticipant(input: ParticipantClassificationInput): ParticipantClassification {
  // No microphone was ever published for this participant — nothing to assemble at all.
  if (!input.assemblyAttempted) {
    return failed(input, 'recording_missing', true);
  }

  // Every start attempt was rejected by the SDK itself before LiveKit ever
  // accepted the request — the orchestrator already recorded this live, and
  // no retry of *verification* could ever change it: there is nothing to find.
  if (input.liveStatus === 'failed_to_start' && input.capturedMs === 0) {
    return failed(input, 'recording_failed_to_start', false, 'failed_to_start');
  }

  if (input.assemblyFailed) {
    return failed(input, 'recording_assembly_failed', true);
  }

  if (!input.verifiedAudio) {
    return failed(input, 'recording_missing', true);
  }

  if (input.capturedMs < MIN_PARTICIPANT_CAPTURED_SECONDS * 1000) {
    // The object itself is real and verified — a too-short recording is a
    // failure of *duration*, not of the file's own existence, so its actual
    // size and length are still worth reporting rather than nulling out.
    return {
      ...failed(input, 'recording_too_short', false),
      audioBytes: input.verifiedAudio.bytes,
      audioDurationMs: input.verifiedAudio.durationMs,
    };
  }

  return {
    // `partial` is purely informational — a launched branch either way, per
    // the PRD's Error Handling: "the pipeline runs on the partial audio if
    // it exceeds 3 minutes."
    recordingStatus: input.hadUnexpectedEnd ? 'partial' : 'complete',
    audioBytes: input.verifiedAudio.bytes,
    audioDurationMs: input.verifiedAudio.durationMs,
    capturedMs: input.capturedMs,
    failureCode: null,
    failureReason: null,
    retryable: false,
    requiresFallbackPlan: false,
    launches: true,
  };
}

/**
 * The lesson-wide recording status, derived from its participants'
 * classifications. `storage_unavailable` is not decided here — the
 * finalizer short-circuits into it before classification ever runs, since
 * it is a fact about the *lesson's* verification pass, not about any one
 * participant's audio.
 */
export function deriveLessonStatus(
  outcomes: ParticipantClassification[],
  lessonDurationSeconds: number,
): LessonRecordingStatus {
  if (lessonDurationSeconds < MIN_LESSON_DURATION_SECONDS) {
    return 'too_short';
  }

  const launched = outcomes.filter((outcome) => outcome.launches).length;
  if (launched === 0) {
    return 'recording_failed';
  }
  if (launched === outcomes.length) {
    return 'recorded';
  }
  return 'recording_partial';
}
