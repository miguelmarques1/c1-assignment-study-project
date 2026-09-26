/**
 * Every failure the API can return carries one of these codes. Clients switch on
 * the code, never on the message, so wording can change without breaking them.
 */
export const ERROR_CODES = {
  /** Wrong password or unknown email. Deliberately identical for both. */
  AUTH_INVALID_CREDENTIALS: 'AUTH001',
  /** Too many failed attempts for this email; the account is locked out. */
  AUTH_LOCKED_OUT: 'AUTH002',
  /** No session, expired session, or a session whose user no longer exists. */
  AUTH_SESSION_INVALID: 'AUTH003',
  /** Password change was attempted with the wrong current password. */
  AUTH_WRONG_CURRENT_PASSWORD: 'AUTH004',
  /** The provider refused the key during validation; nothing was stored. */
  CREDENTIAL_REJECTED: 'CRED001',
  /** No usable credential for this provider — absent, or already marked invalid. */
  CREDENTIAL_UNAVAILABLE: 'CRED002',
  /** The stored credential exists but could not be decrypted. */
  CREDENTIAL_UNREADABLE: 'CRED003',
  /** Request body, query or params failed schema validation. */
  VALIDATION_FAILED: 'VAL001',
  /** Two schema-validation attempts both failed; the raw response is retained. */
  PROMPT_EXECUTION_FAILED: 'PROMPT001',
  /** The requested prompt id has no loaded prompt. */
  PROMPT_NOT_FOUND: 'PROMPT002',
  /** Either the original or the retry attempt exceeded the execution time budget. */
  PROMPT_TIMEOUT: 'PROMPT003',
  /** The model returned no usable candidate, e.g. blocked by a safety filter. */
  PROMPT_EMPTY_RESPONSE: 'PROMPT004',
  /** The room is already at the configured participant cap. */
  CLASSROOM_FULL: 'CLASS001',
  /** LiveKit could not be reached to issue a token or check occupancy. */
  CLASSROOM_UNAVAILABLE: 'CLASS002',
  /** The lesson is already in a terminal state. */
  LESSON_NOT_ACTIVE: 'CLASS003',
  /** The caller is not a participant of the lesson they tried to end. */
  LESSON_NOT_A_PARTICIPANT: 'CLASS004',
  /** Every reroll this lesson allows has already been used. */
  SCENARIO_REROLL_LIMIT: 'SCEN001',
  /** The lesson has started, so its scenario can no longer change. */
  SCENARIO_LOCKED: 'SCEN002',
  /** Only the participant who opened the room may reroll or retry the situation. */
  SCENARIO_NOT_THE_OPENER: 'SCEN003',
  /** Nothing in this lesson's recording is retryable. */
  RECORDING_NOT_RETRYABLE: 'REC001',
  /** The recording is still being captured or finalized. */
  RECORDING_NOT_FINALIZED: 'REC002',
  /** The caller's branch has no failed stage to re-run. */
  PIPELINE_NOT_RETRYABLE: 'PIPE001',
  /** The caller's branch failed at recording, which has its own retry route. */
  PIPELINE_RETRY_RECORDING: 'PIPE002',
  /** No content item has this id. Internal to the content bank today; F16's activity route surfaces it. */
  CONTENT_ITEM_NOT_FOUND: 'CONTENT001',
  /** The slug belongs to an item of another type or provenance, so it is refused rather than overwritten. */
  CONTENT_SLUG_CONFLICT: 'CONTENT002',
  /** At least one infrastructure dependency is unreachable. */
  HEALTH_DEPENDENCY_DOWN: 'HEALTH001',
  /** Unhandled server-side failure. */
  INTERNAL_ERROR: 'ERR500',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** HTTP status paired with each code, so the filter never has to guess. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  [ERROR_CODES.AUTH_INVALID_CREDENTIALS]: 401,
  [ERROR_CODES.AUTH_LOCKED_OUT]: 429,
  [ERROR_CODES.AUTH_SESSION_INVALID]: 401,
  [ERROR_CODES.AUTH_WRONG_CURRENT_PASSWORD]: 400,
  [ERROR_CODES.CREDENTIAL_REJECTED]: 400,
  [ERROR_CODES.CREDENTIAL_UNAVAILABLE]: 409,
  [ERROR_CODES.CREDENTIAL_UNREADABLE]: 500,
  [ERROR_CODES.VALIDATION_FAILED]: 400,
  [ERROR_CODES.PROMPT_EXECUTION_FAILED]: 502,
  [ERROR_CODES.PROMPT_NOT_FOUND]: 404,
  [ERROR_CODES.PROMPT_TIMEOUT]: 504,
  [ERROR_CODES.PROMPT_EMPTY_RESPONSE]: 502,
  [ERROR_CODES.CLASSROOM_FULL]: 409,
  [ERROR_CODES.CLASSROOM_UNAVAILABLE]: 503,
  [ERROR_CODES.LESSON_NOT_ACTIVE]: 409,
  [ERROR_CODES.LESSON_NOT_A_PARTICIPANT]: 403,
  [ERROR_CODES.SCENARIO_REROLL_LIMIT]: 409,
  [ERROR_CODES.SCENARIO_LOCKED]: 409,
  [ERROR_CODES.SCENARIO_NOT_THE_OPENER]: 403,
  [ERROR_CODES.RECORDING_NOT_RETRYABLE]: 409,
  [ERROR_CODES.RECORDING_NOT_FINALIZED]: 409,
  [ERROR_CODES.PIPELINE_NOT_RETRYABLE]: 409,
  [ERROR_CODES.PIPELINE_RETRY_RECORDING]: 409,
  [ERROR_CODES.CONTENT_ITEM_NOT_FOUND]: 404,
  [ERROR_CODES.CONTENT_SLUG_CONFLICT]: 409,
  [ERROR_CODES.HEALTH_DEPENDENCY_DOWN]: 503,
  [ERROR_CODES.INTERNAL_ERROR]: 500,
};

/**
 * User-facing wording. These strings are pinned by the PRD and asserted by the
 * acceptance tests, so changing one is a product decision, not a refactor.
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ERROR_CODES.AUTH_INVALID_CREDENTIALS]: 'Incorrect email or password.',
  [ERROR_CODES.AUTH_LOCKED_OUT]: 'Too many attempts. Try again in 15 minutes.',
  [ERROR_CODES.AUTH_SESSION_INVALID]: 'Session no longer valid.',
  [ERROR_CODES.AUTH_WRONG_CURRENT_PASSWORD]: 'Your current password is incorrect.',
  [ERROR_CODES.CREDENTIAL_REJECTED]: 'The provider rejected this key.',
  [ERROR_CODES.CREDENTIAL_UNAVAILABLE]: 'No usable key for this provider.',
  [ERROR_CODES.CREDENTIAL_UNREADABLE]:
    'This stored key could not be read. Please enter it again.',
  [ERROR_CODES.VALIDATION_FAILED]: 'Some of the values you entered are not valid.',
  [ERROR_CODES.PROMPT_EXECUTION_FAILED]: 'The AI could not produce a valid response for this prompt.',
  [ERROR_CODES.PROMPT_NOT_FOUND]: 'Unknown prompt id.',
  [ERROR_CODES.PROMPT_TIMEOUT]: 'The AI did not respond in time.',
  [ERROR_CODES.PROMPT_EMPTY_RESPONSE]: 'The AI returned no usable response.',
  // Overridden per call with the configured cap — see AppError.classroomFull —
  // because the participant limit is configuration, not a fixed number.
  [ERROR_CODES.CLASSROOM_FULL]: 'This classroom is full.',
  [ERROR_CODES.CLASSROOM_UNAVAILABLE]: 'The classroom is unavailable right now.',
  [ERROR_CODES.LESSON_NOT_ACTIVE]: 'This lesson is no longer active.',
  [ERROR_CODES.LESSON_NOT_A_PARTICIPANT]: 'You are not a participant in this lesson.',
  // Overridden per call with the ceiling — see AppError.rerollLimitReached.
  [ERROR_CODES.SCENARIO_REROLL_LIMIT]: 'You have used all 3 rerolls for this lesson.',
  [ERROR_CODES.SCENARIO_LOCKED]: 'The lesson has started, so the scenario can no longer change.',
  [ERROR_CODES.SCENARIO_NOT_THE_OPENER]:
    'Only the participant who opened the room can change the situation.',
  [ERROR_CODES.RECORDING_NOT_RETRYABLE]: 'There is nothing to retry for this lesson.',
  [ERROR_CODES.RECORDING_NOT_FINALIZED]: 'This lesson is still being processed.',
  [ERROR_CODES.PIPELINE_NOT_RETRYABLE]: 'There is nothing to retry at this stage.',
  [ERROR_CODES.PIPELINE_RETRY_RECORDING]: "This lesson's recording has to be retried first.",
  [ERROR_CODES.CONTENT_ITEM_NOT_FOUND]: 'Content item not found.',
  [ERROR_CODES.CONTENT_SLUG_CONFLICT]: 'This slug is already used by another content item.',
  [ERROR_CODES.HEALTH_DEPENDENCY_DOWN]: 'One or more dependencies are unavailable.',
  [ERROR_CODES.INTERNAL_ERROR]: 'Something went wrong on our side.',
};
