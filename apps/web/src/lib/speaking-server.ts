import { cookies } from 'next/headers';
import type { ApiResponse, SpeakingActivityView } from '@english-quest/shared';

import { internalApiUrl, SESSION_COOKIE } from './api-client';

/** Same shape as `plans-server.ts`'s `ServerRead` — kept local since each area's server reads are self-contained. */
export type ServerRead<T> = { ok: true; data: T } | { ok: false; status: number; code: string | null };

/** The `/speaking/[activityId]` page's own load, as `plans-server.ts`'s reads do. */
export async function getSpeakingActivity(activityId: string): Promise<ServerRead<SpeakingActivityView>> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE);
  if (!token) {
    return { ok: false, status: 401, code: 'AUTH003' };
  }

  try {
    const response = await fetch(`${internalApiUrl}/speaking/activities/${encodeURIComponent(activityId)}`, {
      headers: { cookie: `${SESSION_COOKIE}=${token.value}` },
      cache: 'no-store',
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse<SpeakingActivityView> | null;
    if (response.ok && payload && 'data' in payload) {
      return { ok: true, data: payload.data };
    }
    const code = payload && 'error' in payload ? payload.error.code : null;
    return { ok: false, status: response.status, code };
  } catch {
    return { ok: false, status: 0, code: null };
  }
}
