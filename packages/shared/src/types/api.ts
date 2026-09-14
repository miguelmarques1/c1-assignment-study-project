import type { ErrorCode } from '../errors/codes';

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

/** One field-level problem, as surfaced by the validation pipe. */
export interface ValidationDetail {
  path: string;
  message: string;
}

/** Shape returned by the health endpoint for each probed dependency. */
export interface DependencyHealth {
  name: 'postgres' | 'redis' | 'minio' | 'livekit';
  status: 'up' | 'down';
  latencyMs: number | null;
  error: string | null;
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  dependencies: DependencyHealth[];
}
