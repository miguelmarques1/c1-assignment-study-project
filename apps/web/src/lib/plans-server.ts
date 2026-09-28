import { cookies } from 'next/headers';
import type { ApiResponse, CurrentPlanView, PlanHistoryView, StudyPlanView } from '@english-quest/shared';

import { internalApiUrl, SESSION_COOKIE } from './api-client';

/** Same shape as `lessons-server.ts`'s `ServerRead` — kept local since each area's server reads are self-contained. */
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

/** The dashboard card and the `/plan` page's own load both start here. */
export function getCurrentPlan(): Promise<ServerRead<CurrentPlanView>> {
  return serverGet<CurrentPlanView>('/plans/current');
}

/** The `/plan` page's "previous plans" list. */
export function getPlanHistory(): Promise<ServerRead<PlanHistoryView>> {
  return serverGet<PlanHistoryView>('/plans');
}

/** A single plan by id, for `/plan/[planId]`. */
export function getPlan(planId: string): Promise<ServerRead<StudyPlanView>> {
  return serverGet<StudyPlanView>(`/plans/${encodeURIComponent(planId)}`);
}
