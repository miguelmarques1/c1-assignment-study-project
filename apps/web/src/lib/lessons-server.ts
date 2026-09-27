import { cookies } from 'next/headers';
import type {
  ApiResponse,
  LessonAnalysisView,
  LessonDetailView,
  LessonList,
  LessonPipelineView,
  LessonPronunciationView,
  LessonRecordingView,
  LessonScenarioView,
  LessonTranscriptView,
} from '@english-quest/shared';

import { internalApiUrl, SESSION_COOKIE } from './api-client';

/**
 * A server-side read that keeps the failure's shape, unlike the dashboard's
 * reads that collapse every failure to null: a lesson page renders a
 * different state for "not yours" (`CLASS004`) than for "the API is down".
 */
export type ServerRead<T> = { ok: true; data: T } | { ok: false; status: number; code: string | null };

async function serverGet<T>(path: string): Promise<ServerRead<T>> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE);
  if (!token) {
    return { ok: false, status: 401, code: 'AUTH003' };
  }

  try {
    const response = await fetch(`${internalApiUrl}${path}`, {
      headers: { cookie: `${SESSION_COOKIE}=${token.value}` },
      cache: 'no-store',
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;
    if (response.ok && payload && 'data' in payload) {
      return { ok: true, data: payload.data };
    }
    const code = payload && 'error' in payload ? payload.error.code : null;
    return { ok: false, status: response.status, code };
  } catch {
    return { ok: false, status: 0, code: null };
  }
}

export function getLessonList(): Promise<ServerRead<LessonList>> {
  return serverGet<LessonList>('/lessons');
}

export function getLessonDetail(lessonId: string): Promise<ServerRead<LessonDetailView>> {
  return serverGet<LessonDetailView>(`/lessons/${lessonId}`);
}

export function getLessonScenario(lessonId: string): Promise<ServerRead<LessonScenarioView>> {
  return serverGet<LessonScenarioView>(`/lessons/${lessonId}/scenario`);
}

export function getLessonAnalysis(lessonId: string): Promise<ServerRead<LessonAnalysisView>> {
  return serverGet<LessonAnalysisView>(`/lessons/${lessonId}/analysis`);
}

export function getLessonPronunciation(lessonId: string): Promise<ServerRead<LessonPronunciationView>> {
  return serverGet<LessonPronunciationView>(`/lessons/${lessonId}/pronunciation`);
}

export function getLessonTranscript(lessonId: string): Promise<ServerRead<LessonTranscriptView>> {
  return serverGet<LessonTranscriptView>(`/lessons/${lessonId}/transcript`);
}

export function getLessonPipeline(lessonId: string): Promise<ServerRead<LessonPipelineView>> {
  return serverGet<LessonPipelineView>(`/lessons/${lessonId}/pipeline`);
}

export function getLessonRecording(lessonId: string): Promise<ServerRead<LessonRecordingView>> {
  return serverGet<LessonRecordingView>(`/lessons/${lessonId}/recording`);
}
