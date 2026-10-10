import type { ProgressDashboardView } from '@english-quest/shared';

import { apiFetch } from './api-client';

/** The caller's progress dashboard from the browser: the retry path when the server-side read failed. */
export function fetchProgress(): Promise<ProgressDashboardView> {
  return apiFetch<ProgressDashboardView>('/progress');
}
