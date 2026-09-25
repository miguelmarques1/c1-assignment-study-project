import { ERROR_CODES } from '@english-quest/shared';

import { AppError } from '../common/app-error';
import { isAuthenticationFailure } from '../credentials/credential-executor.service';
import { StageBlockedError, StageFailedError, StageRetryableError } from '../pipeline/pipeline-stage.handler';
import { ANALYSIS_REASONS } from './analysis.constants';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function statusOf(error: unknown): number | undefined {
  return (error as { status?: number } | undefined)?.status;
}

function isQuotaError(error: unknown): boolean {
  if (statusOf(error) === 429) {
    return true;
  }
  return /RESOURCE_EXHAUSTED/i.test(errorMessage(error));
}

/**
 * Maps whatever `PromptExecutionService.execute` (or the credential lookup
 * around it) throws to one of the runner's three typed outcomes, mirroring
 * F08's transcription classifier with Gemini's own errors and F04's
 * `AppError` codes. Anything this function does not recognise is left to
 * propagate — the runner's own catch-all retries it and eventually fails
 * with `internal_error`, exactly like an unclassified database fault.
 */
export function classifyAnalysisError(
  error: unknown,
  geminiCredentialStatus: 'missing' | 'invalid' | 'valid' | 'unverified' | undefined,
): StageBlockedError | StageRetryableError | StageFailedError | undefined {
  if (error instanceof AppError) {
    switch (error.code) {
      case ERROR_CODES.CREDENTIAL_UNAVAILABLE: {
        // The vault reads the same for "no key" and "a key already marked
        // invalid"; the two need different sentences (F08's own reasoning).
        const code = geminiCredentialStatus === 'missing' ? 'credential_missing' : 'credential_rejected';
        return new StageBlockedError(code, ANALYSIS_REASONS[code]);
      }
      case ERROR_CODES.CREDENTIAL_UNREADABLE:
        return new StageBlockedError('credential_unreadable', ANALYSIS_REASONS.credential_unreadable);
      case ERROR_CODES.PROMPT_TIMEOUT:
        return new StageRetryableError('analysis_timeout', ANALYSIS_REASONS.analysis_timeout);
      case ERROR_CODES.PROMPT_EMPTY_RESPONSE:
        return new StageRetryableError('analysis_service_error', ANALYSIS_REASONS.analysis_service_error);
      case ERROR_CODES.PROMPT_EXECUTION_FAILED:
        // The raw response is already retained by F04's telemetry row for
        // this execution (`validation_failed_hard_error`); no second copy.
        return new StageFailedError('analysis_invalid_output', ANALYSIS_REASONS.analysis_invalid_output);
      default:
        return undefined;
    }
  }

  // The vault already marked the credential invalid inside withKey's own
  // catch, before this ever reaches us — this only decides the outcome.
  if (isAuthenticationFailure(error)) {
    return new StageBlockedError('credential_rejected', ANALYSIS_REASONS.credential_rejected, errorMessage(error));
  }

  if (isQuotaError(error)) {
    return new StageRetryableError('analysis_quota_exceeded', ANALYSIS_REASONS.analysis_quota_exceeded, errorMessage(error));
  }

  const status = statusOf(error);
  if (status === undefined || status >= 500) {
    // No HTTP status at all (a network failure, a dropped connection) reads
    // the same as a provider 5xx: worth a retry on the same schedule.
    return new StageRetryableError('analysis_service_error', ANALYSIS_REASONS.analysis_service_error, errorMessage(error));
  }
  // Any other 4xx not already handled as an authentication failure — a
  // malformed request or an unknown model, never worth resending unchanged.
  return new StageFailedError('analysis_request_rejected', ANALYSIS_REASONS.analysis_request_rejected, errorMessage(error));
}
