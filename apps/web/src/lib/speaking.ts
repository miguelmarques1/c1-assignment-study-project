import {
  isApiError,
  SPEAKING_CLIENT_ATTEMPT_HEADER,
  type ApiError,
  type ApiResponse,
  type SpeakingActivityView,
  type SpeakingAttemptView,
  type SpeakingRatingInput,
  type SpeakingRatingView,
} from '@english-quest/shared';

import { apiFetch, ApiRequestError, publicApiUrl } from './api-client';

export function fetchSpeakingActivity(activityId: string): Promise<SpeakingActivityView> {
  return apiFetch<SpeakingActivityView>(`/speaking/activities/${encodeURIComponent(activityId)}`);
}

/** `wav` is the pure encoder's output (A22). The server replays an id it has already seen, so a lost response just resends. */
export function uploadAttempt(
  activityId: string,
  clientAttemptId: string,
  wav: Uint8Array<ArrayBuffer>,
): Promise<SpeakingAttemptView> {
  return apiFetch<SpeakingAttemptView>(`/speaking/activities/${encodeURIComponent(activityId)}/attempts`, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav', [SPEAKING_CLIENT_ATTEMPT_HEADER]: clientAttemptId },
    body: wav,
  });
}

export function rescoreAttempt(attemptId: string): Promise<SpeakingAttemptView> {
  return apiFetch<SpeakingAttemptView>(`/speaking/attempts/${encodeURIComponent(attemptId)}/rescore`, { method: 'POST' });
}

export function rateSpeakingActivity(activityId: string, input: SpeakingRatingInput): Promise<SpeakingRatingView> {
  return apiFetch<SpeakingRatingView>(`/speaking/activities/${encodeURIComponent(activityId)}/rating`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

/** Raw bytes, not the `{ data }` envelope — a plain `fetch`, with `ApiRequestError` thrown only on the error-envelope path. */
export async function fetchAttemptAudio(attemptId: string): Promise<ArrayBuffer> {
  const response = await fetch(`${publicApiUrl}/speaking/attempts/${encodeURIComponent(attemptId)}/audio`, {
    credentials: 'include',
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiResponse<unknown> | null;
    if (payload && isApiError(payload)) {
      throw new ApiRequestError(response.status, payload as ApiError);
    }
    throw new ApiRequestError(response.status, {
      error: { code: 'ERR500', message: 'This recording could not be loaded.' },
    } as ApiError);
  }

  return response.arrayBuffer();
}
