import { describe, expect, it } from 'vitest';

import { rankPlanTags, type RankableEntry, type TagPriorityInput } from '../../src/plans/composition/tag-priority';

function entry(overrides: Partial<RankableEntry> = {}): RankableEntry {
  return { tag: 'grammar:conditional-3', family: 'grammar', occurrenceCount: 1, lastSeenAt: new Date('2026-09-01'), dueAt: null, ...overrides };
}

function input(overrides: Partial<TagPriorityInput> = {}): TagPriorityInput {
  return {
    unmasteredTags: [],
    entries: [],
    recurringTags: [],
    due: [],
    sightings: new Map(),
    ...overrides,
  };
}

describe('rankPlanTags', () => {
  it('due_tags_come_first_ordered_by_due_date', () => {
    const a = entry({ tag: 'grammar:a', dueAt: new Date('2026-09-05') });
    const b = entry({ tag: 'grammar:b', dueAt: new Date('2026-09-01') });
    const ranked = rankPlanTags(
      input({ unmasteredTags: ['grammar:a', 'grammar:b'], entries: [a, b], due: [a, b] }),
    );
    expect(ranked.map((r) => r.tag)).toEqual(['grammar:b', 'grammar:a']);
    expect(ranked.every((r) => r.source === 'due')).toBe(true);
  });

  it('recurring_tags_come_after_due_in_f12s_own_order', () => {
    const due = entry({ tag: 'grammar:due', dueAt: new Date('2026-09-01') });
    const recurring = entry({ tag: 'vocab:recurring' });
    const other = entry({ tag: 'discourse:other' });
    const ranked = rankPlanTags(
      input({
        unmasteredTags: ['grammar:due', 'vocab:recurring', 'discourse:other'],
        entries: [due, recurring, other],
        due: [due],
        recurringTags: ['vocab:recurring'],
      }),
    );
    expect(ranked.map((r) => ({ tag: r.tag, source: r.source }))).toEqual([
      { tag: 'grammar:due', source: 'due' },
      { tag: 'vocab:recurring', source: 'recurring' },
      { tag: 'discourse:other', source: 'unmastered' },
    ]);
  });

  it('remaining_tags_rank_by_occurrence_count_then_recency', () => {
    const frequent = entry({ tag: 'grammar:frequent', occurrenceCount: 5, lastSeenAt: new Date('2026-08-01') });
    const rare = entry({ tag: 'grammar:rare', occurrenceCount: 1, lastSeenAt: new Date('2026-09-20') });
    const ranked = rankPlanTags(input({ unmasteredTags: ['grammar:frequent', 'grammar:rare'], entries: [frequent, rare] }));
    expect(ranked.map((r) => r.tag)).toEqual(['grammar:frequent', 'grammar:rare']);
  });

  it('a_tag_appears_once_even_when_due_and_recurring_both_list_it', () => {
    const tag = entry({ tag: 'grammar:both', dueAt: new Date('2026-09-01') });
    const ranked = rankPlanTags(
      input({ unmasteredTags: ['grammar:both'], entries: [tag], due: [tag], recurringTags: ['grammar:both'] }),
    );
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.source).toBe('due');
  });

  it('phoneme_tags_are_included_unlike_f14s_generation_ranking', () => {
    const phoneme = entry({ tag: 'phoneme:/th/', family: 'phoneme' });
    const ranked = rankPlanTags(input({ unmasteredTags: ['phoneme:/th/'], entries: [phoneme] }));
    expect(ranked.map((r) => r.tag)).toEqual(['phoneme:/th/']);
    expect(ranked[0]!.family).toBe('phoneme');
  });

  it('excludes_tags_not_in_unmastered_or_with_no_ledger_entry', () => {
    const known = entry({ tag: 'grammar:known' });
    const ranked = rankPlanTags(
      input({ unmasteredTags: ['grammar:known', 'grammar:no-entry'], entries: [known] }),
    );
    expect(ranked.map((r) => r.tag)).toEqual(['grammar:known']);
  });

  it('attaches_sightings_when_present_and_null_otherwise', () => {
    const withSightings = entry({ tag: 'grammar:seen' });
    const withoutSightings = entry({ tag: 'grammar:unseen' });
    const ranked = rankPlanTags(
      input({
        unmasteredTags: ['grammar:seen', 'grammar:unseen'],
        entries: [withSightings, withoutSightings],
        sightings: new Map([['grammar:seen', { lessons: 3, of: 5, inLatest: true }]]),
      }),
    );
    expect(ranked.find((r) => r.tag === 'grammar:seen')?.sightings).toEqual({ lessons: 3, of: 5, inLatest: true });
    expect(ranked.find((r) => r.tag === 'grammar:unseen')?.sightings).toBeNull();
  });

  it('ranks_are_1_based_and_sequential', () => {
    const a = entry({ tag: 'grammar:a', occurrenceCount: 3 });
    const b = entry({ tag: 'grammar:b', occurrenceCount: 2 });
    const c = entry({ tag: 'grammar:c', occurrenceCount: 1 });
    const ranked = rankPlanTags(input({ unmasteredTags: ['grammar:a', 'grammar:b', 'grammar:c'], entries: [a, b, c] }));
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });
});
