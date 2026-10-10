import type { ProgressRange } from '@english-quest/shared';

/** The cap the chart caption states: each competency's newest measurements. */
export const PROGRESS_POINTS_PER_COMPETENCY = 20;

/** Days before `now` for each bounded range (24-hour days on the server clock). `all` has no bound. */
export const PROGRESS_RANGE_DAYS: Record<Exclude<ProgressRange, 'all'>, number> = {
  '90d': 90,
  '30d': 30,
};
