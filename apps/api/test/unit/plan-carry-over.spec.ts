import { describe, expect, it } from 'vitest';

import { selectCarryOver, type CarryOverCandidate } from '../../src/plans/composition/carry-over';
import type { RationaleContext } from '../../src/plans/composition/rationale';
import { loadPlanRulesFile } from '../../src/plans/rules/plan-rules';
import { STUDY_PLAN_RULES_PATH } from '../../src/plans/plan.constants';

const { rules } = loadPlanRulesFile(STUDY_PLAN_RULES_PATH);
const ctx: RationaleContext = { labelOf: (tag) => tag.split(':')[1] ?? tag };

let nextId = 1;
function activity(overrides: Partial<CarryOverCandidate> = {}): CarryOverCandidate {
  const id = `act-${nextId++}`;
  return {
    id,
    kind: 'reading',
    contentItemId: `item-${id}`,
    title: `Item ${id}`,
    targetTags: ['grammar:conditional-3'],
    estimatedMinutes: 8,
    isReview: false,
    state: 'pending',
    startedAt: null,
    day: 3,
    position: 1,
    ...overrides,
  };
}

describe('selectCarryOver', () => {
  it('carries_at_most_five', () => {
    const activities = Array.from({ length: 8 }, (_, index) => activity({ day: index + 1 }));
    const carried = selectCarryOver(activities, new Set(['grammar:conditional-3']), rules, ctx);
    expect(carried).toHaveLength(5);
  });

  it('carries_only_activities_whose_tags_are_still_unmastered', () => {
    const stillWeak = activity({ targetTags: ['grammar:conditional-3'] });
    const nowMastered = activity({ targetTags: ['grammar:passive-voice'] });
    const carried = selectCarryOver([stillWeak, nowMastered], new Set(['grammar:conditional-3']), rules, ctx);
    expect(carried).toHaveLength(1);
    expect(carried[0]!.carriedFromActivityId).toBe(stillWeak.id);
  });

  it('in_progress_comes_before_pending', () => {
    const pending = activity({ state: 'pending', day: 1 });
    const inProgress = activity({ state: 'in_progress', day: 5, startedAt: new Date('2026-09-20') });
    const carried = selectCarryOver([pending, inProgress], new Set(['grammar:conditional-3']), rules, ctx);
    expect(carried[0]!.carriedFromActivityId).toBe(inProgress.id);
    expect(carried[0]!.state).toBe('in_progress');
    expect(carried[0]!.startedAt).toEqual(inProgress.startedAt);
  });

  it('orders_ties_by_day_then_position', () => {
    const later = activity({ day: 5, position: 1 });
    const earlier = activity({ day: 2, position: 2 });
    const carried = selectCarryOver([later, earlier], new Set(['grammar:conditional-3']), rules, ctx);
    expect(carried.map((c) => c.carriedFromActivityId)).toEqual([earlier.id, later.id]);
  });

  it('task_slots_carry_like_bank_activities', () => {
    const task = activity({ kind: 'writing', contentItemId: null, targetTags: ['grammar:conditional-3'] });
    const carried = selectCarryOver([task], new Set(['grammar:conditional-3']), rules, ctx);
    expect(carried).toHaveLength(1);
    expect(carried[0]!.contentItemId).toBeNull();
    expect(carried[0]!.kind).toBe('writing');
  });

  it('sets_the_carried_over_rationale', () => {
    const carried = selectCarryOver([activity()], new Set(['grammar:conditional-3']), rules, ctx);
    expect(carried[0]!.rationale).toBe('Carried over from your previous plan: conditional-3 is still unmastered.');
  });
});
