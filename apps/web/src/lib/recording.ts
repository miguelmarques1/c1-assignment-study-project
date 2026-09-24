import type { LessonRecordingView } from '@english-quest/shared';

import { apiFetch } from './api-client';

/** Caller-scoped: `mine` reflects only this account's own recording, never another participant's. */
export function fetchLessonRecording(lessonId: string): Promise<LessonRecordingView> {
  return apiFetch<LessonRecordingView>(`/lessons/${lessonId}/recording`);
}
