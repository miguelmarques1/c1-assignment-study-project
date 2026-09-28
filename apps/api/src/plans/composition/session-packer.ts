import type { PlanActivityKind } from '@english-quest/shared';

import type { StudyPlanRules } from '../rules/plan-rules';
import type { CarriedActivity } from './carry-over';
import type { ActivityPlacement, ComposedSelection, SelectedActivity } from './plan-selection';

export type PackedPlacement = ActivityPlacement | 'carry_over';

export interface PackedActivity {
  day: number;
  position: number;
  kind: PlanActivityKind;
  contentItemId: string | null;
  title: string;
  targetTags: string[];
  estimatedMinutes: number;
  isReview: boolean;
  rationale: string;
  placement: PackedPlacement;
  carriedFromActivityId: string | null;
  state: 'pending' | 'in_progress';
  startedAt: Date | null;
}

export interface PackedSession {
  day: number;
  activities: PackedActivity[];
}

/** Within a session, carry-over first, then this fixed reading order (spec A11). */
const WITHIN_SESSION_ORDER: readonly PlanActivityKind[] = [
  'listening',
  'reading',
  'grammar',
  'vocabulary',
  'error_review',
  'pronunciation',
  'speaking',
  'writing',
];

interface Draft {
  kind: PlanActivityKind;
  contentItemId: string | null;
  title: string;
  targetTags: string[];
  estimatedMinutes: number;
  isReview: boolean;
  rationale: string;
  placement: PackedPlacement;
  carriedFromActivityId: string | null;
  state: 'pending' | 'in_progress';
  startedAt: Date | null;
  /** Insertion order across the whole build, for the review cap's "lowest priority" tie-break. */
  order: number;
}

function draftFromSelected(activity: SelectedActivity, order: number): Draft {
  return {
    kind: activity.kind,
    contentItemId: activity.contentItemId,
    title: activity.title,
    targetTags: activity.targetTags,
    estimatedMinutes: activity.estimatedMinutes,
    isReview: activity.isReview,
    rationale: activity.rationale,
    placement: activity.placement,
    carriedFromActivityId: null,
    state: 'pending',
    startedAt: null,
    order,
  };
}

function draftFromCarried(activity: CarriedActivity, order: number): Draft {
  return {
    kind: activity.kind,
    contentItemId: activity.contentItemId,
    title: activity.title,
    targetTags: activity.targetTags,
    estimatedMinutes: activity.estimatedMinutes,
    isReview: activity.isReview,
    rationale: activity.rationale,
    placement: 'carry_over',
    carriedFromActivityId: activity.carriedFromActivityId,
    state: activity.state,
    startedAt: activity.startedAt,
    order,
  };
}

class SessionBoard {
  private readonly byDay: Draft[][];

  constructor(private readonly rules: StudyPlanRules) {
    this.byDay = Array.from({ length: rules.sessions.count }, () => []);
  }

  minutesOf(day: number): number {
    return this.byDay[day - 1]!.reduce((sum, activity) => sum + activity.estimatedMinutes, 0);
  }

  countOf(day: number): number {
    return this.byDay[day - 1]!.length;
  }

  hasKind(day: number, kind: PlanActivityKind): boolean {
    return this.byDay[day - 1]!.some((activity) => activity.kind === kind);
  }

  underCapacity(day: number): boolean {
    return this.countOf(day) < this.rules.sessions.activities.max;
  }

  fits(day: number, minutes: number): boolean {
    return this.underCapacity(day) && this.minutesOf(day) + minutes <= this.rules.sessions.minutes.max;
  }

  place(day: number, draft: Draft): void {
    this.byDay[day - 1]!.push(draft);
  }

  remove(day: number, draft: Draft): void {
    const list = this.byDay[day - 1]!;
    const index = list.indexOf(draft);
    if (index !== -1) {
      list.splice(index, 1);
    }
  }

  days(): number[] {
    return this.byDay.map((_, index) => index + 1);
  }

  activitiesOf(day: number): readonly Draft[] {
    return this.byDay[day - 1]!;
  }
}

function earliestFitting(board: SessionBoard, minutes: number): number | null {
  for (const day of board.days()) {
    if (board.fits(day, minutes)) {
      return day;
    }
  }
  return null;
}

function earliestUnderCapacity(board: SessionBoard): number | null {
  for (const day of board.days()) {
    if (board.underCapacity(day)) {
      return day;
    }
  }
  return null;
}

function nearestFitting(board: SessionBoard, preferredDay: number, minutes: number): number | null {
  const days = board.days();
  const byDistance = [...days].sort(
    (a, b) => Math.abs(a - preferredDay) - Math.abs(b - preferredDay) || a - b,
  );
  for (const day of byDistance) {
    if (board.fits(day, minutes)) {
      return day;
    }
  }
  for (const day of byDistance) {
    if (board.underCapacity(day)) {
      return day;
    }
  }
  return null;
}

function emptiestFitting(board: SessionBoard, minutes: number): number | null {
  const fitting = board.days().filter((day) => board.fits(day, minutes));
  const pool = fitting.length > 0 ? fitting : board.days().filter((day) => board.underCapacity(day));
  if (pool.length === 0) {
    return null;
  }
  return [...pool].sort((a, b) => board.minutesOf(a) - board.minutesOf(b) || a - b)[0]!;
}

/** The session for a ranked bank item: no activity of the same kind, then fewest minutes, then lowest day (spec A11). */
function bestRankedDay(board: SessionBoard, kind: PlanActivityKind, minutes: number): number | null {
  const fitting = board.days().filter((day) => board.fits(day, minutes));
  const noSameKind = fitting.filter((day) => !board.hasKind(day, kind));
  const pool = noSameKind.length > 0 ? noSameKind : fitting;
  if (pool.length === 0) {
    return null;
  }
  return [...pool].sort((a, b) => board.minutesOf(a) - board.minutesOf(b) || a - b)[0]!;
}

/**
 * Places carry-over, tasks, the quota pins and the ranked bank list into 7
 * days, then fills any day left below 2 activities, then enforces the
 * review cap (spec A11, A12). Deterministic for the same input.
 */
export function packSessions(
  carryOver: readonly CarriedActivity[],
  selection: ComposedSelection,
  rules: StudyPlanRules,
): PackedSession[] {
  const board = new SessionBoard(rules);
  let order = 0;
  const unplaced: Draft[] = [];

  // 1. Carry-over: earliest session that fits, forced placement if none fits exactly.
  for (const activity of carryOver) {
    const draft = draftFromCarried(activity, order++);
    const day = earliestFitting(board, draft.estimatedMinutes) ?? earliestUnderCapacity(board);
    board.place(day ?? 1, draft);
  }

  // 2. Tasks: their configured day, or the nearest day that fits.
  for (const task of selection.tasks) {
    const draft = draftFromSelected(task, order++);
    const day = board.fits(task.preferredDay!, draft.estimatedMinutes)
      ? task.preferredDay!
      : (nearestFitting(board, task.preferredDay!, draft.estimatedMinutes) ?? task.preferredDay!);
    board.place(day, draft);
  }

  // 3. Quota-pinned listening/reading: the emptiest session that fits.
  for (const activity of selection.quotaPinned) {
    const draft = draftFromSelected(activity, order++);
    const day = emptiestFitting(board, draft.estimatedMinutes) ?? 1;
    board.place(day, draft);
  }

  // 4. Ranked bank items, until every session reaches the minutes minimum or the list runs out.
  const everySessionAtMinimum = (): boolean => board.days().every((day) => board.minutesOf(day) >= rules.sessions.minutes.min);
  for (const activity of selection.activities) {
    if (everySessionAtMinimum()) {
      unplaced.push(draftFromSelected(activity, order++));
      continue;
    }
    const draft = draftFromSelected(activity, order++);
    const day = bestRankedDay(board, draft.kind, draft.estimatedMinutes);
    if (day === null) {
      unplaced.push(draft);
      continue;
    }
    board.place(day, draft);
  }

  // 5. A day still below 2 activities takes the next unplaced item (ignoring the minute cap), then a filler task.
  let fillerIndex = 0;
  for (const day of board.days()) {
    while (board.countOf(day) < rules.sessions.activities.min && unplaced.length > 0) {
      board.place(day, unplaced.shift()!);
    }
    while (board.countOf(day) < rules.sessions.activities.min) {
      const kind = rules.tasks.filler[fillerIndex % rules.tasks.filler.length]!;
      fillerIndex += 1;
      board.place(day, {
        kind,
        contentItemId: null,
        title: kind === 'speaking' ? 'Extra speaking practice' : 'Extra pronunciation practice',
        targetTags: [],
        estimatedMinutes: rules.estimates.fixedMinutes[kind],
        isReview: false,
        rationale: 'Extra practice to round out a short session.',
        placement: 'task',
        carriedFromActivityId: null,
        state: 'pending',
        startedAt: null,
        order: order++,
      });
    }
  }

  enforceReviewCap(board, rules, unplaced);

  return board.days().map((day) => ({
    day,
    activities: orderWithinSession(board.activitiesOf(day)).map((draft, index) => ({
      day,
      position: index + 1,
      kind: draft.kind,
      contentItemId: draft.contentItemId,
      title: draft.title,
      targetTags: draft.targetTags,
      estimatedMinutes: draft.estimatedMinutes,
      isReview: draft.isReview,
      rationale: draft.rationale,
      placement: draft.placement,
      carriedFromActivityId: draft.carriedFromActivityId,
      state: draft.state,
      startedAt: draft.startedAt,
    })),
  }));
}

function orderWithinSession(activities: readonly Draft[]): Draft[] {
  const rank = (draft: Draft): number =>
    draft.placement === 'carry_over' ? -1 : WITHIN_SESSION_ORDER.indexOf(draft.kind);
  return [...activities].sort((a, b) => rank(a) - rank(b) || a.order - b.order);
}

/**
 * While review activities exceed `reviewMaxShare` of the plan, drops the
 * lowest-priority non-carried review activity, replacing it in the same
 * session with the next unplaced non-review draft that fits when one is
 * available (spec A12). Carried review activities are never dropped.
 */
function enforceReviewCap(board: SessionBoard, rules: StudyPlanRules, unplaced: Draft[]): void {
  const total = (): number => board.days().reduce((sum, day) => sum + board.countOf(day), 0);
  const reviewCount = (): number =>
    board.days().reduce((sum, day) => sum + board.activitiesOf(day).filter((a) => a.isReview).length, 0);
  const cap = (): number => Math.floor(rules.quotas.reviewMaxShare * total());

  while (reviewCount() > cap()) {
    let removed = false;
    for (const day of board.days()) {
      const candidate = [...board.activitiesOf(day)]
        .filter((a) => a.isReview && a.placement !== 'carry_over')
        .sort((a, b) => b.order - a.order)[0];
      if (!candidate) {
        continue;
      }
      board.remove(day, candidate);
      const replacementIndex = unplaced.findIndex((draft) => !draft.isReview && board.underCapacity(day));
      if (replacementIndex !== -1) {
        board.place(day, unplaced.splice(replacementIndex, 1)[0]!);
      }
      removed = true;
      break;
    }
    if (!removed) {
      // Only carried review activities remain over the cap — accepted rather than dropping carry-over.
      break;
    }
  }
}
