import { ERROR_CODES } from '@english-quest/shared';
import { describe, expect, it } from 'vitest';

import { AppError } from '../../src/common/app-error';
import { classifyGenerationError } from '../../src/generation/generation-error';

function providerError(status: number | undefined, message: string): Error {
  return Object.assign(new Error(message), status === undefined ? {} : { status });
}

describe('generation error classification', () => {
  it('credential_unavailable_or_unreadable_ends_the_run', () => {
    expect(classifyGenerationError(new AppError(ERROR_CODES.CREDENTIAL_UNAVAILABLE))).toMatchObject({ scope: 'run', outcome: 'credential_missing' });
    expect(classifyGenerationError(new AppError(ERROR_CODES.CREDENTIAL_UNREADABLE))).toMatchObject({ scope: 'run', outcome: 'credential_missing' });
  });

  it('authentication_failure_ends_the_run_as_credential_rejected', () => {
    for (const error of [providerError(401, 'nope'), providerError(403, 'PERMISSION_DENIED'), providerError(400, 'API key not valid. Please pass a valid API key.')]) {
      expect(classifyGenerationError(error)).toMatchObject({ scope: 'run', outcome: 'credential_rejected' });
    }
  });

  it('quota_errors_end_the_run', () => {
    expect(classifyGenerationError(providerError(429, 'Too many requests'))).toMatchObject({ scope: 'run', outcome: 'quota_exhausted' });
    expect(classifyGenerationError(providerError(undefined, 'RESOURCE_EXHAUSTED: quota'))).toMatchObject({ scope: 'run', outcome: 'quota_exhausted' });
  });

  it('schema_timeout_empty_and_5xx_end_only_the_attempt', () => {
    expect(classifyGenerationError(AppError.promptExecutionFailed('{}', ['bad']))).toMatchObject({ scope: 'attempt', outcome: 'invalid_output' });
    expect(classifyGenerationError(AppError.promptTimeout('reading-generate'))).toMatchObject({ scope: 'attempt', outcome: 'timeout' });
    expect(classifyGenerationError(AppError.promptEmptyResponse('reading-generate'))).toMatchObject({ scope: 'attempt', outcome: 'empty_response' });
    expect(classifyGenerationError(providerError(503, 'unavailable'))).toMatchObject({ scope: 'attempt', outcome: 'service_error' });
    expect(classifyGenerationError(providerError(undefined, 'socket hang up'))).toMatchObject({ scope: 'attempt', outcome: 'service_error' });
  });

  it('other_4xx_ends_the_attempt_as_request_rejected', () => {
    expect(classifyGenerationError(providerError(400, 'INVALID_ARGUMENT: bad schema'))).toMatchObject({ scope: 'attempt', outcome: 'request_rejected' });
  });

  it('truncates_the_detail_to_its_column', () => {
    expect(classifyGenerationError(providerError(503, 'x'.repeat(900))).detail).toHaveLength(500);
  });
});
