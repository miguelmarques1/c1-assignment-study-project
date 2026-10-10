import type { ActivitySession, PlanSessionView } from '@english-quest/shared';

/**
 * The day's session around one activity: its position and every entry, each
 * a full `PlanActivityView` so a client can hand an entry straight to its
 * route registry. The activity is found by its resolved id, which for a
 * carried copy is the id of the newest row.
 */
export function sessionBlock(session: PlanSessionView, currentId: string): ActivitySession {
  const current = session.activities.find((activity) => activity.id === currentId);
  if (!current) {
    throw new Error(`Activity ${currentId} is not part of day ${session.day}'s session.`);
  }
  return {
    day: session.day,
    position: current.position,
    count: session.activities.length,
    activities: session.activities,
  };
}
