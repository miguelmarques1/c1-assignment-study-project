import { cookies } from 'next/headers';
import type { ActivityView, ApiResponse } from '@english-quest/shared';

import { internalApiUrl, SESSION_COOKIE } from './api-client';

/** Same shape as `plans-server.ts`'s `ServerRead`: each area's server reads are self-contained. */
export type ServerRead<T> = { ok: true; data: T } | { ok: false; status: number; code: string | null };

/** The `/activities/[activityId]` page's own load. It has no side effects: opening an activity consumes nothing. */
export async function getActivity(activityId: string): Promise<ServerRead<ActivityView>> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE);
  if (!token) {
    return { ok: false, status: 401, code: 'AUTH003' };
  }

  try {
    const response = await fetch(`${internalApiUrl}/activities/${encodeURIComponent(activityId)}`, {
      headers: { cookie: `${SESSION_COOKIE}=${token.value}` },
      cache: 'no-store',
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse<ActivityView> | null;
    if (response.ok && payload && 'data' in payload) {
      return { ok: true, data: payload.data };
    }
    const code = payload && 'error' in payload ? payload.error.code : null;
    return { ok: false, status: response.status, code };
  } catch {
    return { ok: false, status: 0, code: null };
  }
}
