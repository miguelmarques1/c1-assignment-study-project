import type { ActivityView, PlanActivityView } from '@english-quest/shared';

import { activityHref } from './activity-routes';

export const TODAY_HREF = '/dashboard';

export type NextStep = { kind: 'next'; href: string; activity: PlanActivityView } | { kind: 'today'; href: string };

/**
 * Where the primary action after a session activity leads (A22): the first
 * other unfinished activity of the session, in order, when its kind has a
 * runner; otherwise Today, which also shows a finished session's summary.
 * It never skips ahead past an activity that has no route yet.
 */
export function nextStep(view: Pick<ActivityView, 'activity' | 'session'>): NextStep {
  const next = [...view.session.activities]
    .sort((a, b) => a.position - b.position)
    .find((activity) => activity.id !== view.activity.id && (activity.state === 'pending' || activity.state === 'in_progress'));
  const href = next ? activityHref(next) : null;
  return next && href ? { kind: 'next', href, activity: next } : { kind: 'today', href: TODAY_HREF };
}
