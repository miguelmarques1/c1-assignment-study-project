import type { PlanActivityKind, PlanActivityView } from '@english-quest/shared';

/**
 * Where `Start session` and an activity card's title send the caller — one
 * entry per kind, registered by the feature that builds that runner (F16
 * for the five bank kinds, F17 for `writing`, F18 for `speaking` and
 * `pronunciation`). Empty until one of those exists, which is exactly what
 * keeps `Start session` from promising a screen nobody built yet (spec A22).
 */
export const ACTIVITY_ROUTES: Partial<Record<PlanActivityKind, (activity: PlanActivityView) => string>> = {
  writing: (activity) => `/plan/activities/${activity.id}/writing`,
  pronunciation: (activity) => `/speaking/${activity.id}`,
  speaking: (activity) => `/speaking/${activity.id}`,
};

/** The href for an activity, or null when no runner is registered for its kind. */
export function activityHref(activity: PlanActivityView): string | null {
  return ACTIVITY_ROUTES[activity.kind]?.(activity) ?? null;
}
