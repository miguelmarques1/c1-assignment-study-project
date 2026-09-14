import { HttpException, HttpStatus, type ArgumentsHost } from '@nestjs/common';
import { ERROR_CODES, type ApiError } from '@english-quest/shared';
import { describe, expect, it, vi } from 'vitest';

import { AppError } from '../../src/common/app-error';
import { HttpExceptionFilter } from '../../src/common/http-exception.filter';

function captureResponse() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;

  return {
    host,
    status,
    body: () => json.mock.calls[0]?.[0] as ApiError,
    statusCode: () => status.mock.calls[0]?.[0] as number,
  };
}

describe('HttpExceptionFilter', () => {
  it('renders_app_error_into_the_envelope', () => {
    const filter = new HttpExceptionFilter();
    const captured = captureResponse();

    filter.catch(AppError.invalidCredentials(), captured.host);

    expect(captured.statusCode()).toBe(401);
    expect(captured.body()).toEqual({
      error: {
        code: ERROR_CODES.AUTH_INVALID_CREDENTIALS,
        message: 'Incorrect email or password.',
        details: null,
      },
    });
  });

  it('carries_details_through', () => {
    const filter = new HttpExceptionFilter();
    const captured = captureResponse();

    filter.catch(AppError.lockedOut(900), captured.host);

    expect(captured.statusCode()).toBe(429);
    expect(captured.body().error.details).toEqual({ retryAfterSeconds: 900 });
  });

  it('maps_nest_http_exception_to_a_code', () => {
    const filter = new HttpExceptionFilter();
    const captured = captureResponse();

    filter.catch(new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED), captured.host);

    expect(captured.statusCode()).toBe(401);
    expect(captured.body().error.code).toBe(ERROR_CODES.AUTH_SESSION_INVALID);
  });

  it('never_leaks_internal_details_on_unknown_failures', () => {
    const filter = new HttpExceptionFilter();
    const captured = captureResponse();

    filter.catch(new Error('connection string postgres://user:hunter2@db'), captured.host);

    expect(captured.statusCode()).toBe(500);
    expect(captured.body().error.code).toBe(ERROR_CODES.INTERNAL_ERROR);
    expect(JSON.stringify(captured.body())).not.toContain('hunter2');
  });
});
