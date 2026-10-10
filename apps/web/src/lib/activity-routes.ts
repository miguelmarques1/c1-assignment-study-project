import type { PlanActivityKind, PlanActivityView } from '@english-quest/shared';

/**
 * Where `Start session` and an activity card's title send the caller — one
 * entry per kind, registered by the feature that builds that runner (F16
 * for the five bank kinds, F17 for `writing`, F18 for `speaking` and
 * `pronunciation`). A kind with no entry keeps `Start session` from
 * promising a screen nobody built yet (spec A22).
 */
const objectiveRoute = (activity: PlanActivityView): string => `/activities/${activity.id}`;

export const ACTIVITY_ROUTES: Partial<Record<PlanActivityKind, (activity: PlanActivityView) => string>> = {
  listening: objectiveRoute,
  reading: objectiveRoute,
  vocabulary: objectiveRoute,
  grammar: objectiveRoute,
  error_review: objectiveRoute,
  writing: (activity) => `/plan/activities/${activity.id}/writing`,
  pronunciation: (activity) => `/speaking/${activity.id}`,
  speaking: (activity) => `/speaking/${activity.id}`,
};

/** The href for an activity, or null when no runner is registered for its kind. */
export function activityHref(activity: PlanActivityView): string | null {
  return ACTIVITY_ROUTES[activity.kind]?.(activity) ?? null;
}
