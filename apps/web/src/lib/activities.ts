import type {
  ActivityRatingInput,
  ActivityRatingView,
  ActivityView,
  ObjectiveSubmissionInput,
} from '@english-quest/shared';

import { apiFetch, publicApiUrl } from './api-client';

/** Creates (or returns) the attempt, on the learner's first interaction (A4). Idempotent. */
export function startAttempt(activityId: string): Promise<ActivityView> {
  return apiFetch<ActivityView>(`/activities/${encodeURIComponent(activityId)}/attempts`, { method: 'POST' });
}

/** Idempotent per attempt: a repeat returns the stored result, so a retry after a dropped connection is always safe. */
export function submitAttempt(activityId: string, attemptId: string, input: ObjectiveSubmissionInput): Promise<ActivityView> {
  return apiFetch<ActivityView>(
    `/activities/${encodeURIComponent(activityId)}/attempts/${encodeURIComponent(attemptId)}/submission`,
    { method: 'PUT', body: JSON.stringify(input) },
  );
}

export function skipActivity(activityId: string, reason: string): Promise<ActivityView> {
  return apiFetch<ActivityView>(`/activities/${encodeURIComponent(activityId)}/skip`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function rateActivity(activityId: string, input: ActivityRatingInput): Promise<ActivityRatingView> {
  return apiFetch<ActivityRatingView>(`/activities/${encodeURIComponent(activityId)}/rating`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

/** The audio element authenticates with the session cookie (same site as the API). */
export function activityMediaUrl(activityId: string): string {
  return `${publicApiUrl}/activities/${encodeURIComponent(activityId)}/media`;
}
