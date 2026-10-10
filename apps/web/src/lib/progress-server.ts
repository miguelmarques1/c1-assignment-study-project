import { cookies } from 'next/headers';
import type { ApiResponse, ProgressDashboardView } from '@english-quest/shared';

import { internalApiUrl, SESSION_COOKIE } from './api-client';

/** Same shape as `plans-server.ts`'s `ServerRead`; each area's server reads are self-contained. */
export type ServerRead<T> = { ok: true; data: T } | { ok: false; status: number; code: string | null };

/** The progress page's first paint (F20); a failed read hands the retry to the browser. */
export async function getProgressView(): Promise<ServerRead<ProgressDashboardView>> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE);
  if (!token) {
    return { ok: false, status: 401, code: 'AUTH003' };
  }

  try {
    const response = await fetch(`${internalApiUrl}/progress`, {
      headers: { cookie: `${SESSION_COOKIE}=${token.value}` },
      cache: 'no-store',
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse<ProgressDashboardView> | null;
    if (response.ok && payload && 'data' in payload) {
      return { ok: true, data: payload.data };
    }
    const code = payload && 'error' in payload ? payload.error.code : null;
    return { ok: false, status: response.status, code };
  } catch {
    return { ok: false, status: 0, code: null };
  }
}
