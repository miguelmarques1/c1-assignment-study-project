import { describe, expect, it } from 'vitest';

import { focusTagsOf, summaryLine } from '../../src/plans/composition/summary-line';
import type { PackedActivity, PackedSession } from '../../src/plans/composition/session-packer';
import type { RankedPlanTag } from '../../src/plans/composition/tag-priority';

function activity(overrides: Partial<PackedActivity> = {}): PackedActivity {
  return {
    day: 1,
    position: 1,
    kind: 'reading',
    contentItemId: 'item-1',
    title: 'Item',
    targetTags: [],
    estimatedMinutes: 6,
    isReview: false,
    rationale: 'Because.',
    placement: 'guardrail',
    carriedFromActivityId: null,
    state: 'pending',
    startedAt: null,
    ...overrides,
  };
}

function tag(rank: number): RankedPlanTag {
  return { tag: `t${rank}`, family: 'grammar', source: 'unmastered', rank, sightings: null };
}

describe('focusTagsOf', () => {
  it('ranks_by_activity_count_then_priority', () => {
    const activities = [
      activity({ targetTags: ['frequent'] }),
      activity({ targetTags: ['frequent'] }),
      activity({ targetTags: ['rare'] }),
    ];
    const priority = new Map([
      ['frequent', tag(5)],
      ['rare', tag(1)],
    ]);
    expect(focusTagsOf(activities, priority)).toEqual(['frequent', 'rare']);
  });

  it('caps_at_three_tags', () => {
    const activities = ['a', 'b', 'c', 'd'].map((t) => activity({ targetTags: [t] }));
    const priority = new Map(['a', 'b', 'c', 'd'].map((t, i) => [t, tag(i + 1)]));
    expect(focusTagsOf(activities, priority)).toHaveLength(3);
  });

  it('breaks_a_count_tie_by_priority_rank', () => {
    const activities = [activity({ targetTags: ['low-priority'] }), activity({ targetTags: ['high-priority'] })];
    const priority = new Map([
      ['low-priority', tag(9)],
      ['high-priority', tag(1)],
    ]);
    expect(focusTagsOf(activities, priority)).toEqual(['high-priority', 'low-priority']);
  });

  it('is_empty_with_no_tagged_activities', () => {
    expect(focusTagsOf([activity({ targetTags: [] })], new Map())).toEqual([]);
  });
});

describe('summaryLine', () => {
  const sessions: PackedSession[] = Array.from({ length: 7 }, (_, i) => ({ day: i + 1, activities: [] }));
  const activities = Array.from({ length: 21 }, () => activity());

  it('matches_the_prd_example_shape', () => {
    expect(summaryLine(sessions, activities, ['third conditional', 'phrasal verb', '/th/'], false)).toBe(
      '7 sessions · 21 activities · focused on third conditional, phrasal verb and /th/',
    );
  });

  it('handles_a_single_focus_tag', () => {
    expect(summaryLine(sessions, activities, ['third conditional'], false)).toBe(
      '7 sessions · 21 activities · focused on third conditional',
    );
  });

  it('handles_two_focus_tags', () => {
    expect(summaryLine(sessions, activities, ['a', 'b'], false)).toBe('7 sessions · 21 activities · focused on a and b');
  });

  it('omits_the_focus_clause_in_general_mode', () => {
    expect(summaryLine(sessions, activities, ['a', 'b'], true)).toBe('7 sessions · 21 activities');
  });

  it('omits_the_focus_clause_with_no_tags', () => {
    expect(summaryLine(sessions, activities, [], false)).toBe('7 sessions · 21 activities');
  });
});
