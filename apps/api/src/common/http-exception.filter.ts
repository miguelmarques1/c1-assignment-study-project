import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { ERROR_CODES, ERROR_MESSAGES, type ApiError, type ErrorCode } from '@english-quest/shared';
import type { Response } from 'express';

import { AppError } from './app-error';

/**
 * Renders every failure into the one envelope clients are allowed to depend on.
 * Unhandled exceptions are logged in full but answered generically, so an
 * internal stack trace never reaches a response body.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    const { status, body } = this.render(exception);

    if (status >= 500) {
      this.logger.error(
        exception instanceof Error ? exception.message : String(exception),
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json(body);
  }

  private render(exception: unknown): { status: number; body: ApiError } {
    if (exception instanceof AppError) {
      return {
        status: exception.status,
        body: {
          error: {
            code: exception.code,
            message: exception.message,
            details: exception.details,
          },
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code: ErrorCode =
        status === 401
          ? ERROR_CODES.AUTH_SESSION_INVALID
          : status === 400
            ? ERROR_CODES.VALIDATION_FAILED
            : ERROR_CODES.INTERNAL_ERROR;

      return {
        status,
        body: {
          error: {
            code,
            message: status >= 500 ? ERROR_MESSAGES[ERROR_CODES.INTERNAL_ERROR] : exception.message,
            details: null,
          },
        },
      };
    }

    return {
      status: 500,
      body: {
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.INTERNAL_ERROR],
          details: null,
        },
      },
    };
  }
}
