import { isApiError, type ApiError, type ApiResponse } from '@english-quest/shared';

export const SESSION_COOKIE = 'eq_session';

/** Base URL for requests made from the browser. */
export const publicApiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Base URL for requests made from a server component, inside the container network. */
export const internalApiUrl = process.env.API_INTERNAL_URL ?? publicApiUrl;

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly payload: ApiError,
  ) {
    super(payload.error.message);
    this.name = 'ApiRequestError';
  }

  get code(): string {
    return this.payload.error.code;
  }

  get details(): unknown {
    return this.payload.error.details;
  }
}

/**
 * Browser-side request. Always sends credentials so the session cookie travels
 * with every call, and turns the error envelope into a typed exception rather
 * than leaving each caller to unwrap it.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${publicApiUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok || isApiError(payload)) {
    throw new ApiRequestError(response.status, payload as ApiError);
  }

  return payload.data;
}
