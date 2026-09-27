import type { PlanSessionView, StudyPlanView } from '@english-quest/shared';

export type TodayMode = 'in_progress' | 'completed_today' | 'next' | 'plan_complete';

export interface TodaySelection {
  /** Null exactly when `mode` is `plan_complete`. */
  session: PlanSessionView | null;
  mode: TodayMode;
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Which session `Today` shows (spec A16), mirrored in Dart for the mobile
 * Today tab so both clients agree without either asking the server for the
 * device's day: (1) the earliest session in progress; (2) the latest
 * session completed on the device's local today, so a finished session
 * stays visible with its summary until the day turns; (3) the first
 * untouched session, so a gap in use never skips ahead; (4) none, when the
 * whole plan is done. Pure — `now` is the device's own clock.
 */
export function selectTodaySession(plan: StudyPlanView, now: Date): TodaySelection {
  const inProgress = plan.sessions.find((session) => session.state === 'in_progress');
  if (inProgress) {
    return { session: inProgress, mode: 'in_progress' };
  }

  const todayKey = localDateKey(now);
  const completedToday = plan.sessions.filter(
    (session) => session.state === 'completed' && session.completedAt !== null && localDateKey(new Date(session.completedAt)) === todayKey,
  );
  if (completedToday.length > 0) {
    const latest = completedToday.reduce((best, session) => (session.day > best.day ? session : best));
    return { session: latest, mode: 'completed_today' };
  }

  const next = plan.sessions.find((session) => session.state === 'not_started');
  if (next) {
    return { session: next, mode: 'next' };
  }

  return { session: null, mode: 'plan_complete' };
}
