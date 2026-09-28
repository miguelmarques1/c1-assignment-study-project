import type { StudyPlanOrigin } from '@english-quest/shared';

import { ORIGIN_RANK } from '../plan.constants';

/** The tuple spec A1 orders plans by: lesson time first, origin rank as the tie-breaker. */
export interface Precedence {
  time: number;
  rank: number;
}

export function precedenceOf(lessonTime: Date, origin: StudyPlanOrigin): Precedence {
  return { time: lessonTime.getTime(), rank: ORIGIN_RANK[origin] };
}

/** Positive when `a` outranks `b`, negative when `b` outranks `a`, 0 when equal. */
export function comparePrecedence(a: Precedence, b: Precedence): number {
  return a.time - b.time || a.rank - b.rank;
}

export function outranks(a: Precedence, b: Precedence): boolean {
  return comparePrecedence(a, b) > 0;
}

/** Spec A2: a build is superseded when an existing plan's precedence is "at least" its own. */
export function atLeast(a: Precedence, b: Precedence): boolean {
  return comparePrecedence(a, b) >= 0;
}
