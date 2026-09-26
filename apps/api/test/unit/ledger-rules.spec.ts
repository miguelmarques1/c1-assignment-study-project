import { describe, expect, it } from 'vitest';

import {
  aggregateEntry,
  selectRecurring,
  tagTrend,
  windowCounts,
  type RecurringCandidate,
} from '../../src/profile/ledger-rules';
import { DAY_MS } from '../../src/profile/profile.constants';

const NOW = new Date('2026-09-25T10:00:00.000Z');

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS);
}

function candidate(
  tag: string,
  occurredDaysAgo: number[],
  options: { state?: RecurringCandidate['state']; total?: number } = {},
): RecurringCandidate {
  const times = occurredDaysAgo.map(daysAgo);
  return {
    tag,
    occurrenceCount: options.total ?? times.length,
    recentOccurrenceCount: windowCounts(times, NOW).recent,
    lastSeenAt: new Date(Math.max(...times.map((time) => time.getTime()))),
    state: options.state ?? 'new',
  };
}

const neverRetired = () => false;

describe('ledger rules', () => {
  it('aggregates_count_and_first_last_seen', () => {
    const aggregate = aggregateEntry(
      [
        { occurredAt: daysAgo(3), activityId: null },
        { occurredAt: daysAgo(10), activityId: null },
        { occurredAt: daysAgo(1), activityId: null },
      ],
      [],
    )!;

    expect(aggregate.occurrenceCount).toBe(3);
    expect(aggregate.firstSeenAt).toEqual(daysAgo(10));
    expect(aggregate.lastSeenAt).toEqual(daysAgo(1));
    expect(aggregateEntry([], [{ occurredAt: daysAgo(1) }])).toBeNull();
  });

  it('lesson_only_evidence_is_new', () => {
    expect(aggregateEntry([{ occurredAt: daysAgo(1), activityId: null }], [])!.state).toBe('new');
  });

  it('activity_evidence_makes_it_practicing', () => {
    const lesson = { occurredAt: daysAgo(2), activityId: null };
    const activity = { occurredAt: daysAgo(1), activityId: '0f1e2d3c-4b5a-4968-8776-5a4b3c2d1e0f' };

    expect(aggregateEntry([lesson, activity], [])!.state).toBe('practicing');
    expect(aggregateEntry([lesson], [{ occurredAt: daysAgo(1) }])!.state).toBe('practicing');
  });

  it('core_never_writes_mastered_or_a_due_date', () => {
    const encounters = [5, 4, 3, 2, 1, 0].map((days) => ({ occurredAt: daysAgo(days) }));
    const aggregate = aggregateEntry([{ occurredAt: daysAgo(9), activityId: null }], encounters)!;

    expect(aggregate.state).toBe('practicing');
    expect(aggregate).not.toHaveProperty('dueAt');
  });

  it('recurring_needs_three_occurrences_in_thirty_days', () => {
    const qualifying = candidate('grammar:past-simple', [1, 10, 29]);
    const oneTooOld = candidate('grammar:present-perfect', [1, 10, 31]);
    const onlyTwo = candidate('vocab:collocation', [1, 2]);

    expect(selectRecurring([qualifying, oneTooOld, onlyTwo], neverRetired).map((entry) => entry.tag)).toEqual([
      'grammar:past-simple',
    ]);
  });

  it('recurring_excludes_mastered_and_retired_tags', () => {
    const mastered = candidate('grammar:past-simple', [1, 2, 3], { state: 'mastered' });
    const retired = candidate('grammar:retired-tag', [1, 2, 3]);
    const practicing = candidate('vocab:collocation', [1, 2, 3], { state: 'practicing' });

    const selected = selectRecurring([mastered, retired, practicing], (tag) => tag === 'grammar:retired-tag');
    expect(selected.map((entry) => entry.tag)).toEqual(['vocab:collocation']);
  });

  it('recurring_ranks_by_count_then_recency_then_tag', () => {
    const entries = [
      candidate('discourse:connector', [2, 3, 4]),
      candidate('grammar:articles', [1, 2, 3], { total: 9 }),
      candidate('vocab:collocation', [1, 5, 6]),
      candidate('grammar:past-simple', [1, 5, 6]),
      candidate('vocab:register', [1, 2, 3, 4]),
    ];

    expect(selectRecurring(entries, neverRetired).map((entry) => entry.tag)).toEqual([
      'grammar:articles',
      'vocab:register',
      'grammar:past-simple',
      'vocab:collocation',
      'discourse:connector',
    ]);
  });

  it('tag_trend_compares_the_last_thirty_days_with_the_thirty_before', () => {
    expect(tagTrend(windowCounts([daysAgo(1), daysAgo(2), daysAgo(40)], NOW))).toBe('rising');
    expect(tagTrend(windowCounts([daysAgo(1), daysAgo(35), daysAgo(50)], NOW))).toBe('falling');
    expect(tagTrend(windowCounts([daysAgo(1), daysAgo(45), daysAgo(90)], NOW))).toBe('flat');
    expect(windowCounts([daysAgo(30), daysAgo(60), daysAgo(61)], NOW)).toEqual({ recent: 1, previous: 1 });
  });
});
