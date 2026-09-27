import type { CurrentPlanView } from '@english-quest/shared';

import { apiFetch } from './api-client';

/** The owner's retry of a failed plan build (spec A28's `PlanRequestJob`, or the pipeline's own retry for a `lesson` origin). */
export function retryPlan(): Promise<CurrentPlanView> {
  return apiFetch<CurrentPlanView>('/plans/retry', { method: 'POST' });
}
