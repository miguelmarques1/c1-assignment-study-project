import type { ClassroomEndResult, ClassroomSession, ClassroomToken } from '@english-quest/shared';

import { apiFetch } from './api-client';

export function requestClassroomToken(): Promise<ClassroomToken> {
  return apiFetch<ClassroomToken>('/classroom/token', { method: 'POST' });
}

export function fetchClassroomSession(): Promise<ClassroomSession> {
  return apiFetch<ClassroomSession>('/classroom/session');
}

export function endLesson(lessonId: string): Promise<ClassroomEndResult> {
  return apiFetch<ClassroomEndResult>(`/classroom/${lessonId}/end`, { method: 'POST' });
}
