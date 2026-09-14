import type { z } from 'zod';

import type { ErrorCode } from '../errors/codes';
import type {
  dependencyHealthSchema,
  healthReportSchema,
  validationDetailSchema,
} from '../schemas/api';

/** Successful responses always nest the payload under `data`. */
export interface ApiSuccess<T> {
  data: T;
}

/** Failures always nest under `error`, never at the top level. */
export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    details: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function isApiError<T>(response: ApiResponse<T>): response is ApiError {
  return 'error' in response;
}

// Inferred from the schemas rather than declared twice, so the runtime
// contract and the compile-time type cannot drift apart.
export type ValidationDetail = z.infer<typeof validationDetailSchema>;
export type DependencyHealth = z.infer<typeof dependencyHealthSchema>;
export type HealthReport = z.infer<typeof healthReportSchema>;
