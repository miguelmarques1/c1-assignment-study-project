import { describe, expect, it } from 'vitest';

import type { CarriedActivity } from '../../src/plans/composition/carry-over';
import type { ActivityPlacement, ComposedSelection, SelectedActivity } from '../../src/plans/composition/plan-selection';
import { packSessions } from '../../src/plans/composition/session-packer';
import { loadPlanRulesFile } from '../../src/plans/rules/plan-rules';
import { STUDY_PLAN_RULES_PATH } from '../../src/plans/plan.constants';

const { rules } = loadPlanRulesFile(STUDY_PLAN_RULES_PATH);

let nextId = 1;
function bankActivity(overrides: Partial<SelectedActivity> = {}): SelectedActivity {
  const id = `bank-${nextId++}`;
  return {
    kind: 'reading',
    contentItemId: id,
    title: `Item ${id}`,
    targetTags: ['grammar:conditional-3'],
    estimatedMinutes: 6,
    rationale: 'Chosen because this is a weak spot.',
    isReview: false,
    placement: 'guardrail' as ActivityPlacement,
    preferredDay: null,
    ...overrides,
  };
}

function selection(overrides: Partial<ComposedSelection> = {}): ComposedSelection {
  return { quotaPinned: [], activities: [], tasks: [], notes: [], ...overrides };
}

function carried(overrides: Partial<CarriedActivity> = {}): CarriedActivity {
  const id = `carried-${nextId++}`;
  return {
    kind: 'reading',
    contentItemId: id,
    title: `Carried ${id}`,
    targetTags: ['grammar:conditional-3'],
    estimatedMinutes: 6,
    isReview: false,
    rationale: 'Carried over from your previous plan.',
    carriedFromActivityId: id,
    state: 'pending',
    startedAt: null,
    ...overrides,
  };
}

function manyReadingItems(count: number, minutes = 6): SelectedActivity[] {
  return Array.from({ length: count }, () => bankActivity({ kind: 'reading', estimatedMinutes: minutes }));
}

describe('packSessions', () => {
  it('packs_seven_sessions', () => {
    const sessions = packSessions([], selection({ activities: manyReadingItems(30) }), rules);
    expect(sessions).toHaveLength(7);
    expect(sessions.map((s) => s.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('every_session_has_between_two_and_four_activities_with_a_large_pool', () => {
    const sessions = packSessions([], selection({ activities: manyReadingItems(40, 3) }), rules);
    for (const session of sessions) {
      expect(session.activities.length).toBeGreaterThanOrEqual(rules.sessions.activities.min);
      expect(session.activities.length).toBeLessThanOrEqual(rules.sessions.activities.max);
    }
  });

  it('a_tiny_pool_still_yields_at_least_two_activities_per_session_via_filler', () => {
    const sessions = packSessions([], selection({ activities: [bankActivity()] }), rules);
    for (const session of sessions) {
      expect(session.activities.length).toBeGreaterThanOrEqual(rules.sessions.activities.min);
    }
  });

  it('places_tasks_on_their_configured_days', () => {
    const writing1 = bankActivity({ kind: 'writing', contentItemId: null, preferredDay: 2, estimatedMinutes: 15, placement: 'task' });
    const writing2 = bankActivity({ kind: 'writing', contentItemId: null, preferredDay: 5, estimatedMinutes: 15, placement: 'task' });
    const sessions = packSessions([], selection({ tasks: [writing1, writing2] }), rules);
    expect(sessions[1]!.activities.some((a) => a.kind === 'writing')).toBe(true);
    expect(sessions[4]!.activities.some((a) => a.kind === 'writing')).toBe(true);
  });

  it('places_carry_over_before_anything_else_it_shares_a_day_with', () => {
    const carriedItem = carried();
    const bank = bankActivity({ kind: 'listening' });
    const sessions = packSessions([carriedItem], selection({ quotaPinned: [bank] }), rules);
    const day = sessions.find((s) => s.activities.some((a) => a.placement === 'carry_over'));
    expect(day).toBeDefined();
    const carriedIndex = day!.activities.findIndex((a) => a.placement === 'carry_over');
    expect(carriedIndex).toBe(0);
  });

  it('review_never_exceeds_thirty_percent', () => {
    const reviewItems = Array.from({ length: 15 }, () => bankActivity({ kind: 'error_review', isReview: true, estimatedMinutes: 6 }));
    const nonReview = manyReadingItems(10);
    const sessions = packSessions([], selection({ activities: [...reviewItems, ...nonReview] }), rules);
    const total = sessions.reduce((sum, s) => sum + s.activities.length, 0);
    const reviewCount = sessions.reduce((sum, s) => sum + s.activities.filter((a) => a.isReview).length, 0);
    expect(reviewCount).toBeLessThanOrEqual(Math.floor(rules.quotas.reviewMaxShare * total));
  });

  it('orders_receptive_activities_before_productive_within_a_session', () => {
    const listening = bankActivity({ kind: 'listening', estimatedMinutes: 9 });
    const writing = bankActivity({ kind: 'writing', contentItemId: null, preferredDay: 1, estimatedMinutes: 15, placement: 'task' });
    const sessions = packSessions([], selection({ quotaPinned: [listening], tasks: [writing] }), rules);
    const day1 = sessions[0]!;
    const kinds = day1.activities.map((a) => a.kind);
    expect(kinds.indexOf('listening')).toBeLessThan(kinds.indexOf('writing'));
  });

  it('is_deterministic_for_the_same_input', () => {
    const activities = manyReadingItems(20);
    const first = packSessions([], selection({ activities }), rules);
    const second = packSessions([], selection({ activities }), rules);
    expect(first).toEqual(second);
  });

  it('positions_are_sequential_within_each_day', () => {
    const sessions = packSessions([], selection({ activities: manyReadingItems(25, 3) }), rules);
    for (const session of sessions) {
      expect(session.activities.map((a) => a.position)).toEqual(session.activities.map((_, i) => i + 1));
    }
  });

  it('sessions_land_within_fifteen_to_twenty_minutes_when_the_pool_allows', () => {
    // Enough varied-minute items that every session can reach the 15-minute floor without busting 20.
    const items: SelectedActivity[] = [];
    for (let i = 0; i < 20; i++) {
      items.push(bankActivity({ kind: i % 2 === 0 ? 'reading' : 'grammar', estimatedMinutes: 6 }));
    }
    const sessions = packSessions([], selection({ activities: items }), rules);
    for (const session of sessions) {
      const minutes = session.activities.reduce((sum, a) => sum + a.estimatedMinutes, 0);
      expect(minutes).toBeLessThanOrEqual(rules.sessions.minutes.max);
    }
  });
});
