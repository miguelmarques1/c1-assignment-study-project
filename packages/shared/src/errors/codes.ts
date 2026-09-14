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
  /** Request body, query or params failed schema validation. */
  VALIDATION_FAILED: 'VAL001',
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
  [ERROR_CODES.VALIDATION_FAILED]: 400,
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
  [ERROR_CODES.VALIDATION_FAILED]: 'Some of the values you entered are not valid.',
  [ERROR_CODES.HEALTH_DEPENDENCY_DOWN]: 'One or more dependencies are unavailable.',
  [ERROR_CODES.INTERNAL_ERROR]: 'Something went wrong on our side.',
};
