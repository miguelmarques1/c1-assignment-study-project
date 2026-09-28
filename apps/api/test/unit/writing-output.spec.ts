import { describe, expect, it } from 'vitest';

import { groupErrors } from '../../src/writing/output/error-groups';
import { highlightSegments } from '../../src/writing/output/highlight-segments';

/**
 * `processCorrectionOutput` (`writing-output.ts`) itself is covered once
 * Stage 3 adds it, alongside `quote-locator.ts`. This file starts with the
 * two pure read-time helpers the view builder already uses: segmenting the
 * submitted text for highlights, and grouping errors by tag.
 */

describe('highlightSegments', () => {
  it('highlight_segments_concatenate_to_the_text', () => {
    const text = 'The cat sat on the mat.';
    const errors = [
      { index: 0, startOffset: 4, endOffset: 7 },
      { index: 1, startOffset: 19, endOffset: 22 },
    ];
    const segments = highlightSegments(text, errors);
    expect(segments.map((s) => s.text).join('')).toBe(text);
    expect(segments.find((s) => s.text === 'cat')?.errorIndexes).toEqual([0]);
    expect(segments.find((s) => s.text === 'mat')?.errorIndexes).toEqual([1]);
  });

  it('overlapping_errors_share_a_segment', () => {
    const text = 'The quick brown fox';
    const errors = [
      { index: 0, startOffset: 4, endOffset: 15 },
      { index: 1, startOffset: 10, endOffset: 19 },
    ];
    const segments = highlightSegments(text, errors);
    expect(segments.map((s) => s.text).join('')).toBe(text);
    const shared = segments.find((s) => s.text === 'brown');
    expect(shared?.errorIndexes.sort()).toEqual([0, 1]);
  });

  it('no_errors_is_a_single_plain_segment', () => {
    const text = 'Plain text with no errors.';
    expect(highlightSegments(text, [])).toEqual([{ text, errorIndexes: [] }]);
  });
});

describe('groupErrors', () => {
  const labelOf = (tag: string) => tag.split(':')[1]!;

  it('groups_by_tag_with_recurrence_from_the_prior_count', () => {
    const errors = [
      { index: 0, tag: 'grammar:preposition' },
      { index: 1, tag: 'grammar:preposition' },
    ];
    const groups = groupErrors(errors, { 'grammar:preposition': 3 }, labelOf);
    expect(groups).toEqual([
      { tag: 'grammar:preposition', tagLabel: 'preposition', errorIndexes: [0, 1], recurrence: { count: 5, label: '5th time' } },
    ]);
  });

  it('no_recurrence_badge_for_a_first_sighting', () => {
    const errors = [{ index: 0, tag: 'vocab:idiom' }];
    const groups = groupErrors(errors, {}, labelOf);
    expect(groups[0]!.recurrence).toBeNull();
  });

  it('orders_groups_by_size_then_first_position', () => {
    const errors = [
      { index: 0, tag: 'vocab:idiom' },
      { index: 1, tag: 'grammar:preposition' },
      { index: 2, tag: 'grammar:preposition' },
    ];
    const groups = groupErrors(errors, {}, labelOf);
    expect(groups.map((g) => g.tag)).toEqual(['grammar:preposition', 'vocab:idiom']);
  });
});
