import { ERROR_CODES, ERROR_MESSAGES, ERROR_STATUS, type ErrorCode } from '@english-quest/shared';

/**
 * Every failure the API raises on purpose is an AppError. The exception filter
 * turns it into the response envelope, so controllers never build error bodies
 * by hand and the code-to-status mapping lives in exactly one place.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ErrorCode, details: unknown = null, message?: string) {
    super(message ?? ERROR_MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }

  static invalidCredentials(): AppError {
    return new AppError(ERROR_CODES.AUTH_INVALID_CREDENTIALS);
  }

  static lockedOut(retryAfterSeconds: number): AppError {
    return new AppError(ERROR_CODES.AUTH_LOCKED_OUT, { retryAfterSeconds });
  }

  static sessionInvalid(): AppError {
    return new AppError(ERROR_CODES.AUTH_SESSION_INVALID);
  }

  static wrongCurrentPassword(): AppError {
    return new AppError(ERROR_CODES.AUTH_WRONG_CURRENT_PASSWORD);
  }

  static validationFailed(details: unknown): AppError {
    return new AppError(ERROR_CODES.VALIDATION_FAILED, details);
  }

  static promptExecutionFailed(rawResponse: string, validationErrors: string[]): AppError {
    return new AppError(ERROR_CODES.PROMPT_EXECUTION_FAILED, { rawResponse, validationErrors });
  }

  static promptNotFound(promptId: string): AppError {
    return new AppError(ERROR_CODES.PROMPT_NOT_FOUND, { promptId });
  }

  static promptTimeout(promptId: string): AppError {
    return new AppError(ERROR_CODES.PROMPT_TIMEOUT, { promptId });
  }

  static promptEmptyResponse(promptId: string): AppError {
    return new AppError(ERROR_CODES.PROMPT_EMPTY_RESPONSE, { promptId });
  }

  /** The cap is configuration, so the pinned message is overridden with its live value. */
  static classroomFull(maxParticipants: number): AppError {
    return new AppError(
      ERROR_CODES.CLASSROOM_FULL,
      { maxParticipants },
      `This classroom is full (${maxParticipants} participants).`,
    );
  }

  static classroomUnavailable(reason: string): AppError {
    return new AppError(ERROR_CODES.CLASSROOM_UNAVAILABLE, { reason });
  }

  static lessonNotActive(): AppError {
    return new AppError(ERROR_CODES.LESSON_NOT_ACTIVE);
  }

  static notAParticipant(): AppError {
    return new AppError(ERROR_CODES.LESSON_NOT_A_PARTICIPANT);
  }

  /** The ceiling is a constant today, but the message states whatever value is in force. */
  static rerollLimitReached(limit: number): AppError {
    return new AppError(
      ERROR_CODES.SCENARIO_REROLL_LIMIT,
      { limit },
      `You have used all ${limit} rerolls for this lesson.`,
    );
  }

  static scenarioLocked(): AppError {
    return new AppError(ERROR_CODES.SCENARIO_LOCKED);
  }

  static notTheOpener(): AppError {
    return new AppError(ERROR_CODES.SCENARIO_NOT_THE_OPENER);
  }

  /** Nothing in the lesson's recording is retryable — the current state is carried so the client can say why. */
  static recordingNotRetryable(recordingStatus: string): AppError {
    return new AppError(ERROR_CODES.RECORDING_NOT_RETRYABLE, { recordingStatus });
  }

  static recordingNotFinalized(): AppError {
    return new AppError(ERROR_CODES.RECORDING_NOT_FINALIZED);
  }

  /** The caller's branch has no failed stage to re-run; the current stage and status say why. */
  static pipelineNotRetryable(stage: string | null, status: string | null): AppError {
    return new AppError(ERROR_CODES.PIPELINE_NOT_RETRYABLE, { stage, status });
  }

  /** The caller's branch failed at recording, which F07's lesson-wide route retries. */
  static pipelineRetryRecording(lessonId: string): AppError {
    return new AppError(ERROR_CODES.PIPELINE_RETRY_RECORDING, {
      retryRoute: `/lessons/${lessonId}/recording/retry`,
    });
  }

  /** An unknown entry id and another user's are the same answer, so existence never leaks. */
  static ledgerEntryNotFound(): AppError {
    return new AppError(ERROR_CODES.PROFILE_LEDGER_ENTRY_NOT_FOUND);
  }

  static contentItemNotFound(itemId: string): AppError {
    return new AppError(ERROR_CODES.CONTENT_ITEM_NOT_FOUND, { itemId });
  }

  /** The slug's current owner is carried so F14 can tell a curated collision from a type mismatch. */
  static contentSlugConflict(slug: string, existingType: string, existingProvenance: string): AppError {
    return new AppError(ERROR_CODES.CONTENT_SLUG_CONFLICT, { slug, existingType, existingProvenance });
  }

  /** An unknown plan id and another user's are the same answer, so existence never leaks. */
  static studyPlanNotFound(): AppError {
    return new AppError(ERROR_CODES.STUDY_PLAN_NOT_FOUND);
  }

  static planNothingToRetry(): AppError {
    return new AppError(ERROR_CODES.PLAN_NOTHING_TO_RETRY);
  }

  /** An unknown activity id and another user's are the same answer, so existence never leaks. */
  static planActivityNotFound(activityId: string): AppError {
    return new AppError(ERROR_CODES.PLAN_ACTIVITY_NOT_FOUND, { activityId });
  }

  static planActivityNotInCurrentPlan(activityId: string): AppError {
    return new AppError(ERROR_CODES.PLAN_ACTIVITY_NOT_IN_CURRENT_PLAN, { activityId });
  }

  /** An unknown activity id, another user's, and one that is not a speaking kind are the same answer. */
  static speakingActivityNotFound(): AppError {
    return new AppError(ERROR_CODES.SPEAKING_ACTIVITY_NOT_FOUND);
  }

  static speakingAttemptLimit(): AppError {
    return new AppError(ERROR_CODES.SPEAKING_ATTEMPT_LIMIT);
  }

  /** `reason` is one of `WavHeaderFailureReason` (A30), carried for the client's diagnostic detail. */
  static speakingAudioInvalid(reason: string): AppError {
    return new AppError(ERROR_CODES.SPEAKING_AUDIO_INVALID, { reason });
  }

  static speakingAudioTooLong(): AppError {
    return new AppError(ERROR_CODES.SPEAKING_AUDIO_TOO_LONG);
  }

  /** An unknown attempt id and another user's are the same answer, so existence never leaks. */
  static speakingAttemptNotFound(): AppError {
    return new AppError(ERROR_CODES.SPEAKING_ATTEMPT_NOT_FOUND);
  }

  /** `reason` is one of `not_failed`, `not_transient`, `audio_missing` (spec §5). */
  static speakingNotRescorable(reason: string): AppError {
    return new AppError(ERROR_CODES.SPEAKING_NOT_RESCORABLE, { reason });
  }

  static speakingScoringInFlight(): AppError {
    return new AppError(ERROR_CODES.SPEAKING_SCORING_IN_FLIGHT);
  }

  static speakingUploadFailed(): AppError {
    return new AppError(ERROR_CODES.SPEAKING_UPLOAD_FAILED);
  }

  static speakingActivitySkipped(): AppError {
    return new AppError(ERROR_CODES.SPEAKING_ACTIVITY_SKIPPED);
  }
}
