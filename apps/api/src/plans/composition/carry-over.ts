import type { PlanActivityKind } from '@english-quest/shared';

import type { StudyPlanRules } from '../rules/plan-rules';
import { carriedOverRationale, type RationaleContext } from './rationale';

/** An unfinished activity from the plan being replaced, as read from the database. */
export interface CarryOverCandidate {
  id: string;
  kind: PlanActivityKind;
  contentItemId: string | null;
  title: string;
  targetTags: string[];
  estimatedMinutes: number;
  isReview: boolean;
  state: 'pending' | 'in_progress';
  startedAt: Date | null;
  day: number;
  position: number;
}

export interface CarriedActivity {
  kind: PlanActivityKind;
  contentItemId: string | null;
  title: string;
  targetTags: string[];
  estimatedMinutes: number;
  isReview: boolean;
  rationale: string;
  carriedFromActivityId: string;
  state: 'pending' | 'in_progress';
  startedAt: Date | null;
}

/**
 * Up to `rules.carryOver.max` unfinished activities from the previous plan
 * whose target tags are still unmastered, `in_progress` first, then by day
 * and position (spec A13). A task activity (no content item) carries the
 * same way as a bank one. Pure.
 */
export function selectCarryOver(
  previous: readonly CarryOverCandidate[],
  unmasteredTags: ReadonlySet<string>,
  rules: StudyPlanRules,
  rationaleCtx: RationaleContext,
): CarriedActivity[] {
  const eligible = previous.filter((activity) => activity.targetTags.some((tag) => unmasteredTags.has(tag)));
  const stateRank = (state: 'pending' | 'in_progress'): number => (state === 'in_progress' ? 0 : 1);
  const ordered = [...eligible].sort(
    (a, b) => stateRank(a.state) - stateRank(b.state) || a.day - b.day || a.position - b.position,
  );

  return ordered.slice(0, rules.carryOver.max).map((activity) => {
    const primaryTag = activity.targetTags.find((tag) => unmasteredTags.has(tag)) ?? null;
    return {
      kind: activity.kind,
      contentItemId: activity.contentItemId,
      title: activity.title,
      targetTags: activity.targetTags,
      estimatedMinutes: activity.estimatedMinutes,
      isReview: activity.isReview,
      rationale: carriedOverRationale(primaryTag, rationaleCtx),
      carriedFromActivityId: activity.id,
      state: activity.state,
      startedAt: activity.startedAt,
    };
  });
}
