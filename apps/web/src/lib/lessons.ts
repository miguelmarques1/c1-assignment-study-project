import type { LessonList, LessonPipelineView, LessonRecordingView } from '@english-quest/shared';

import { apiFetch } from './api-client';

/** Browser-side: the page after `cursor`, for the list's `Load more`. */
export function fetchLessonPage(cursor: string): Promise<LessonList> {
  return apiFetch<LessonList>(`/lessons?cursor=${encodeURIComponent(cursor)}`);
}

/** F08's retry of the caller's own failed stage. */
export function retryPipelineStage(lessonId: string): Promise<LessonPipelineView> {
  return apiFetch<LessonPipelineView>(`/lessons/${lessonId}/pipeline/retry`, { method: 'POST' });
}

/** F07's retry of a failed recording step. */
export function retryRecording(lessonId: string): Promise<LessonRecordingView> {
  return apiFetch<LessonRecordingView>(`/lessons/${lessonId}/recording/retry`, { method: 'POST' });
}
