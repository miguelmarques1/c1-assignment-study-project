import { ERROR_CODES } from '@english-quest/shared';

import { AppError } from '../common/app-error';
import { isAuthenticationFailure } from '../credentials/credential-executor.service';

/** Why a run stopped calling the model. */
export type AbandonReason = 'credential_missing' | 'credential_rejected' | 'quota_exhausted';

/** Everything an attempt row can record (the migration's `ck_generation_attempts_outcome`). */
export type AttemptOutcome =
  | 'passed'
  | 'gate_failed'
  | 'invalid_output'
  | 'timeout'
  | 'empty_response'
  | 'service_error'
  | 'request_rejected'
  | AbandonReason;

export type ClassifiedGenerationError =
  | { scope: 'run'; outcome: AbandonReason; detail: string }
  | { scope: 'attempt'; outcome: Exclude<AttemptOutcome, 'passed' | 'gate_failed' | AbandonReason>; detail: string };

/** A provider message for the curator's record, truncated to its column. Never key material: providers do not echo keys. */
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
 * Maps whatever `PromptExecutionService.execute` throws to an attempt
 * outcome (spec A4), following F11's `classifyAnalysisError`. A missing,
 * unreadable or rejected key and an exhausted quota end the whole run: the
 * PRD skips generation without a key and abandons the rest of a batch on
 * quota rather than retrying. Anything else costs only the attempt, and the
 * slot's second attempt is the retry F04 leaves to its caller.
 */
export function classifyGenerationError(error: unknown): ClassifiedGenerationError {
  const detail = detailOf(error);
  if (error instanceof AppError) {
    switch (error.code) {
      case ERROR_CODES.CREDENTIAL_UNAVAILABLE:
      case ERROR_CODES.CREDENTIAL_UNREADABLE:
        return { scope: 'run', outcome: 'credential_missing', detail };
      case ERROR_CODES.PROMPT_EXECUTION_FAILED:
        return { scope: 'attempt', outcome: 'invalid_output', detail };
      case ERROR_CODES.PROMPT_TIMEOUT:
        return { scope: 'attempt', outcome: 'timeout', detail };
      case ERROR_CODES.PROMPT_EMPTY_RESPONSE:
        return { scope: 'attempt', outcome: 'empty_response', detail };
      default:
        return { scope: 'attempt', outcome: 'service_error', detail };
    }
  }
  if (isAuthenticationFailure(error)) {
    return { scope: 'run', outcome: 'credential_rejected', detail };
  }
  if (isQuotaError(error)) {
    return { scope: 'run', outcome: 'quota_exhausted', detail };
  }
  const status = statusOf(error);
  if (status === undefined || status >= 500) {
    return { scope: 'attempt', outcome: 'service_error', detail };
  }
  return { scope: 'attempt', outcome: 'request_rejected', detail };
}
