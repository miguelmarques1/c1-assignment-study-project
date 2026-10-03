import { ERROR_CODES } from '@english-quest/shared';

import { AppError } from '../../common/app-error';
import { isAuthenticationFailure } from '../../credentials/credential-executor.service';

/** How a failed correction request is handled (A11): a key failure and an invalid-output failure never retry; anything else does, once. */
export type CorrectionFailureKind = 'gemini_key' | 'invalid_output' | 'retryable';

/** The short label appended to `writing_corrections.attempt_outcomes` for the curator. */
export type CorrectionAttemptOutcome =
  | 'timeout'
  | 'empty_response'
  | 'quota'
  | 'service_error'
  | 'request_rejected'
  | 'gemini_key'
  | 'invalid_output';

export interface ClassifiedCorrectionError {
  kind: CorrectionFailureKind;
  attemptOutcome: CorrectionAttemptOutcome;
  /** A provider message for the curator's record, truncated to the column. Never key material. */
  detail: string;
  /** Only for `invalid_output` — F04's own raw response, for `writing_corrections.raw_response`. */
  rawResponse?: string;
}

function detailOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

function statusOf(error: unknown): number | undefined {
  return (error as { status?: number } | undefined)?.status;
}

function isQuotaError(error: unknown): boolean {
  return statusOf(error) === 429 || /RESOURCE_EXHAUSTED/i.test(detailOf(error));
}

/**
 * Maps whatever `PromptExecutionService.execute` throws to a correction
 * outcome (A11), following F14's `classifyGenerationError`. A missing,
 * unreadable or rejected key fails the correction outright — F02 marks a
 * rejected key invalid on its own. Two schema-validation attempts inside F04
 * are `invalid_output`, whose raw response is kept for the curator.
 * Everything else — a timeout, an empty response, quota, a network or
 * provider error, or another 4xx rejection — is retried once (A11).
 */
export function classifyCorrectionError(error: unknown): ClassifiedCorrectionError {
  const detail = detailOf(error);
  if (error instanceof AppError) {
    switch (error.code) {
      case ERROR_CODES.CREDENTIAL_UNAVAILABLE:
      case ERROR_CODES.CREDENTIAL_UNREADABLE:
        return { kind: 'gemini_key', attemptOutcome: 'gemini_key', detail };
      case ERROR_CODES.PROMPT_EXECUTION_FAILED: {
        const details = error.details as { rawResponse?: string } | undefined;
        return { kind: 'invalid_output', attemptOutcome: 'invalid_output', detail, rawResponse: details?.rawResponse };
      }
      case ERROR_CODES.PROMPT_TIMEOUT:
        return { kind: 'retryable', attemptOutcome: 'timeout', detail };
      case ERROR_CODES.PROMPT_EMPTY_RESPONSE:
        return { kind: 'retryable', attemptOutcome: 'empty_response', detail };
      default:
        return { kind: 'retryable', attemptOutcome: 'service_error', detail };
    }
  }
  if (isAuthenticationFailure(error)) {
    return { kind: 'gemini_key', attemptOutcome: 'gemini_key', detail };
  }
  if (isQuotaError(error)) {
    return { kind: 'retryable', attemptOutcome: 'quota', detail };
  }
  const status = statusOf(error);
  if (status === undefined || status >= 500) {
    return { kind: 'retryable', attemptOutcome: 'service_error', detail };
  }
  return { kind: 'retryable', attemptOutcome: 'request_rejected', detail };
}
