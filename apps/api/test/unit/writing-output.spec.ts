import { describe, expect, it } from 'vitest';

import { groupErrors } from '../../src/writing/output/error-groups';
import { highlightSegments } from '../../src/writing/output/highlight-segments';
import { processCorrectionOutput, type RawCorrectionError } from '../../src/writing/output/writing-output';

/**
 * Alongside `processCorrectionOutput` itself, this file covers the two pure
 * read-time helpers the view builder uses: segmenting the submitted text
 * for highlights, and grouping errors by tag.
 */

function error(overrides: Partial<RawCorrectionError> = {}): RawCorrectionError {
  return { quote: 'x', tag: 'grammar:preposition', correction: 'y', explanation: 'because', ...overrides };
}

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

describe('processCorrectionOutput', () => {
  const submittedText = 'The cat sat on the mat. The dog sat on the rug.';

  it('caps_errors_at_thirty_before_matching', () => {
    const raw = Array.from({ length: 40 }, (_, i) => error({ quote: `invented-quote-${i}` }));
    const result = processCorrectionOutput({ raw: { errors: raw }, submittedText });
    // None of the invented quotes exist in the text, so every considered candidate is discarded —
    // but only the first 30 are ever considered at all.
    expect(result.discardedErrorCount).toBe(30);
    expect(result.errors).toHaveLength(0);
  });

  it('discards_unlocated_quotes_and_counts_them', () => {
    const raw = [
      error({ quote: 'cat sat', tag: 'grammar:preposition' }),
      error({ quote: 'a phrase never written', tag: 'vocab:idiom' }),
      error({ quote: 'dog sat', tag: 'grammar:preposition' }),
    ];
    const result = processCorrectionOutput({ raw: { errors: raw }, submittedText });
    expect(result.errors).toHaveLength(2);
    expect(result.discardedErrorCount).toBe(1);
  });

  it('discards_overlong_quotes_and_corrections', () => {
    const raw = [error({ quote: 'cat sat', correction: 'y'.repeat(600) })];
    const result = processCorrectionOutput({ raw: { errors: raw }, submittedText });
    expect(result.errors).toHaveLength(0);
    expect(result.discardedErrorCount).toBe(1);
  });

  it('dedupes_the_same_span_and_tag', () => {
    // The text has exactly one occurrence of "cat sat"; the model reports it as an error twice.
    const raw = [error({ quote: 'cat sat' }), error({ quote: 'cat sat' })];
    const result = processCorrectionOutput({ raw: { errors: raw }, submittedText });
    expect(result.errors).toHaveLength(1);
    expect(result.discardedErrorCount).toBe(1);
  });

  it('orders_errors_by_position_in_the_text', () => {
    const raw = [error({ quote: 'dog sat' }), error({ quote: 'cat sat' })];
    const result = processCorrectionOutput({ raw: { errors: raw }, submittedText });
    expect(result.errors.map((e) => e.quote)).toEqual(['cat sat', 'dog sat']);
    expect(result.errors.map((e) => e.idx)).toEqual([0, 1]);
  });

  it('stores_the_texts_own_span_and_offsets', () => {
    const raw = [error({ quote: 'cat sat' })];
    const result = processCorrectionOutput({ raw: { errors: raw }, submittedText });
    const [accepted] = result.errors;
    expect(submittedText.slice(accepted!.startOffset, accepted!.endOffset)).toBe('cat sat');
  });
});
