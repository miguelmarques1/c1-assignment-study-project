import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ValidationDetail } from '@english-quest/shared';
import type { ZodType } from 'zod';

import { AppError } from './app-error';

/**
 * Validates a request payload against a schema from the shared package, so the
 * API and the clients enforce the same contract from one definition.
 *
 * Used per-parameter: `@Body(new ZodValidationPipe(loginSchema))`.
 */
@Injectable()
export class ZodValidationPipe<TOutput> implements PipeTransform<unknown, TOutput> {
  constructor(private readonly schema: ZodType<TOutput>) {}

  transform(value: unknown): TOutput {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const details: ValidationDetail[] = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      throw AppError.validationFailed(details);
    }

    return result.data;
  }
}
