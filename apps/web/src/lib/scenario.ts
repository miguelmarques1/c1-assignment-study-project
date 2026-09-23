import type { ScenarioView } from '@english-quest/shared';

import { apiFetch } from './api-client';

export function fetchScenario(): Promise<ScenarioView> {
  return apiFetch<ScenarioView>('/classroom/scenario');
}

export function rerollSituation(): Promise<ScenarioView> {
  return apiFetch<ScenarioView>('/classroom/scenario/reroll', { method: 'POST' });
}

export function retrySituation(): Promise<ScenarioView> {
  return apiFetch<ScenarioView>('/classroom/scenario/retry', { method: 'POST' });
}
