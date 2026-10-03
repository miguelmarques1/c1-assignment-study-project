import { ERROR_CODES } from '@english-quest/shared';
import { describe, expect, it } from 'vitest';

import { AppError } from '../../src/common/app-error';
import { classifyCorrectionError } from '../../src/writing/correction/correction-error';

describe('classifyCorrectionError', () => {
  it('missing_or_unreadable_key_is_a_key_failure', () => {
    expect(classifyCorrectionError(new AppError(ERROR_CODES.CREDENTIAL_UNAVAILABLE)).kind).toBe('gemini_key');
    expect(classifyCorrectionError(new AppError(ERROR_CODES.CREDENTIAL_UNREADABLE)).kind).toBe('gemini_key');
  });

  it('authentication_failure_is_a_key_failure', () => {
    const result = classifyCorrectionError({ status: 401, message: 'UNAUTHENTICATED' });
    expect(result.kind).toBe('gemini_key');
    expect(result.attemptOutcome).toBe('gemini_key');
  });

  it('schema_failure_twice_is_invalid_output_with_the_raw_response', () => {
    const error = AppError.promptExecutionFailed('{"bad": true}', ['overall_comment is required']);
    const result = classifyCorrectionError(error);
    expect(result.kind).toBe('invalid_output');
    expect(result.rawResponse).toBe('{"bad": true}');
  });

  it('timeout_is_retryable', () => {
    const result = classifyCorrectionError(AppError.promptTimeout('writing-correct'));
    expect(result.kind).toBe('retryable');
    expect(result.attemptOutcome).toBe('timeout');
  });

  it('empty_response_is_retryable', () => {
    const result = classifyCorrectionError(AppError.promptEmptyResponse('writing-correct'));
    expect(result.kind).toBe('retryable');
    expect(result.attemptOutcome).toBe('empty_response');
  });

  it('quota_is_retryable', () => {
    const result = classifyCorrectionError({ status: 429, message: 'RESOURCE_EXHAUSTED' });
    expect(result.kind).toBe('retryable');
    expect(result.attemptOutcome).toBe('quota');
  });

  it('provider_5xx_network_and_other_4xx_are_retryable', () => {
    expect(classifyCorrectionError({ status: 503, message: 'Service unavailable' }).attemptOutcome).toBe('service_error');
    expect(classifyCorrectionError(new Error('network error'))).toMatchObject({ kind: 'retryable', attemptOutcome: 'service_error' });
    expect(classifyCorrectionError({ status: 400, message: 'Bad request' }).attemptOutcome).toBe('request_rejected');
  });
});
