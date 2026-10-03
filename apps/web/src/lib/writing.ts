import type { SaveWritingDraftInput, SubmitWritingInput, WritingActivityView, WritingDraftSaved } from '@english-quest/shared';

import { apiFetch } from './api-client';

/** First open composes and stores the task; every later call (from any device) returns the same one. */
export function openWriting(activityId: string): Promise<WritingActivityView> {
  return apiFetch<WritingActivityView>(`/activities/${encodeURIComponent(activityId)}/writing/open`, { method: 'POST' });
}

/** Read-only, with no state change — what the screen polls while `correcting`. */
export function getWriting(activityId: string): Promise<WritingActivityView> {
  return apiFetch<WritingActivityView>(`/activities/${encodeURIComponent(activityId)}/writing`);
}

/** `keepalive` lets the request survive a page unload during the hide/pagehide flush. */
export function saveWritingDraft(
  activityId: string,
  input: SaveWritingDraftInput,
  options: { keepalive?: boolean } = {},
): Promise<WritingDraftSaved> {
  return apiFetch<WritingDraftSaved>(`/activities/${encodeURIComponent(activityId)}/writing/draft`, {
    method: 'PUT',
    body: JSON.stringify(input),
    keepalive: options.keepalive,
  });
}

export function submitWriting(activityId: string, input: SubmitWritingInput): Promise<WritingActivityView> {
  return apiFetch<WritingActivityView>(`/activities/${encodeURIComponent(activityId)}/writing/submit`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
