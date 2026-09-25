import { ERROR_CODES } from '@english-quest/shared';
import { describe, expect, it } from 'vitest';

import { AppError } from '../../src/common/app-error';
import { classifyAnalysisError } from '../../src/analysis/analysis-outcome';
import { StageBlockedError, StageFailedError, StageRetryableError } from '../../src/pipeline/pipeline-stage.handler';

function apiError(status: number, message = 'provider error'): Error {
  return Object.assign(new Error(message), { status });
}

describe('classifyAnalysisError', () => {
  it('a_missing_key_blocks_as_missing', () => {
    const outcome = classifyAnalysisError(new AppError(ERROR_CODES.CREDENTIAL_UNAVAILABLE), 'missing');
    expect(outcome).toBeInstanceOf(StageBlockedError);
    expect((outcome as StageBlockedError).reasonCode).toBe('credential_missing');
  });

  it('an_invalid_key_blocks_as_rejected', () => {
    const viaVault = classifyAnalysisError(new AppError(ERROR_CODES.CREDENTIAL_UNAVAILABLE), 'invalid');
    expect(viaVault).toBeInstanceOf(StageBlockedError);
    expect((viaVault as StageBlockedError).reasonCode).toBe('credential_rejected');

    const via401 = classifyAnalysisError(apiError(401), undefined);
    expect(via401).toBeInstanceOf(StageBlockedError);
    expect((via401 as StageBlockedError).reasonCode).toBe('credential_rejected');

    const via403 = classifyAnalysisError(apiError(403), undefined);
    expect((via403 as StageBlockedError).reasonCode).toBe('credential_rejected');

    const viaMessage = classifyAnalysisError(new Error('API_KEY_INVALID: bad key'), undefined);
    expect((viaMessage as StageBlockedError).reasonCode).toBe('credential_rejected');
  });

  it('an_unreadable_key_blocks_as_unreadable', () => {
    const outcome = classifyAnalysisError(new AppError(ERROR_CODES.CREDENTIAL_UNREADABLE), undefined);
    expect(outcome).toBeInstanceOf(StageBlockedError);
    expect((outcome as StageBlockedError).reasonCode).toBe('credential_unreadable');
  });

  it('quota_is_retryable', () => {
    const via429 = classifyAnalysisError(apiError(429), undefined);
    expect(via429).toBeInstanceOf(StageRetryableError);
    expect((via429 as StageRetryableError).reasonCode).toBe('analysis_quota_exceeded');

    const viaMessage = classifyAnalysisError(new Error('RESOURCE_EXHAUSTED: quota'), undefined);
    expect((viaMessage as StageRetryableError).reasonCode).toBe('analysis_quota_exceeded');
  });

  it('a_timeout_is_retryable', () => {
    const outcome = classifyAnalysisError(AppError.promptTimeout('lesson-analysis'), undefined);
    expect(outcome).toBeInstanceOf(StageRetryableError);
    expect((outcome as StageRetryableError).reasonCode).toBe('analysis_timeout');
    expect((outcome as StageRetryableError).reason).toBe('The analysis request timed out.');
  });

  it('service_errors_and_empty_responses_are_retryable', () => {
    const via500 = classifyAnalysisError(apiError(500), undefined);
    expect(via500).toBeInstanceOf(StageRetryableError);
    expect((via500 as StageRetryableError).reasonCode).toBe('analysis_service_error');

    const viaNetwork = classifyAnalysisError(new Error('ECONNRESET'), undefined);
    expect(viaNetwork).toBeInstanceOf(StageRetryableError);
    expect((viaNetwork as StageRetryableError).reasonCode).toBe('analysis_service_error');

    const viaEmpty = classifyAnalysisError(AppError.promptEmptyResponse('lesson-analysis'), undefined);
    expect(viaEmpty).toBeInstanceOf(StageRetryableError);
    expect((viaEmpty as StageRetryableError).reasonCode).toBe('analysis_service_error');
  });

  it('two_schema_failures_fail_now', () => {
    const outcome = classifyAnalysisError(AppError.promptExecutionFailed('{}', ['bad tag']), undefined);
    expect(outcome).toBeInstanceOf(StageFailedError);
    expect((outcome as StageFailedError).reasonCode).toBe('analysis_invalid_output');
  });

  it('other_client_errors_fail_now', () => {
    const via400 = classifyAnalysisError(apiError(400), undefined);
    expect(via400).toBeInstanceOf(StageFailedError);
    expect((via400 as StageFailedError).reasonCode).toBe('analysis_request_rejected');

    const via404 = classifyAnalysisError(apiError(404), undefined);
    expect((via404 as StageFailedError).reasonCode).toBe('analysis_request_rejected');
  });

  it('an_unrecognized_error_is_left_unclassified', () => {
    const outcome = classifyAnalysisError(new AppError(ERROR_CODES.PROMPT_NOT_FOUND, { promptId: 'x' }), undefined);
    expect(outcome).toBeUndefined();
  });
});
