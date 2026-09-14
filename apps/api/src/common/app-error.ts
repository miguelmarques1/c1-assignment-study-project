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
}
