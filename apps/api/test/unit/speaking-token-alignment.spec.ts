import { describe, expect, it } from 'vitest';

import { alignTokens, tokenizeDisplay } from '../../src/speaking/scoring/token-alignment';

describe('tokenizeDisplay', () => {
  it('keeps_the_original_spelling_and_punctuation_while_normalizing_for_alignment', () => {
    const tokens = tokenizeDisplay('Nothing, in the valley—was thought through.');

    expect(tokens.map((t) => t.text)).toEqual(['Nothing,', 'in', 'the', 'valley—was', 'thought', 'through.']);
    expect(tokens.map((t) => t.normalized)).toEqual(['nothing', 'in', 'the', 'valley—was', 'thought', 'through']);
  });

  it('drops_empty_tokens_from_repeated_whitespace', () => {
    const tokens = tokenizeDisplay('one    two\nthree');

    expect(tokens.map((t) => t.text)).toEqual(['one', 'two', 'three']);
  });
});

describe('alignTokens', () => {
  it('matches_an_identical_sequence_pairwise_in_order', () => {
    const pairs = alignTokens(['a', 'b', 'c'], ['a', 'b', 'c']);

    expect(pairs).toEqual([
      { aIndex: 0, bIndex: 0 },
      { aIndex: 1, bIndex: 1 },
      { aIndex: 2, bIndex: 2 },
    ]);
  });

  it('skips_a_deletion_on_the_reference_side', () => {
    // "the quick fox" vs recognized "the fox" (quick omitted)
    const pairs = alignTokens(['the', 'quick', 'fox'], ['the', 'fox']);

    expect(pairs).toEqual([
      { aIndex: 0, bIndex: 0 },
      { aIndex: 2, bIndex: 1 },
    ]);
  });

  it('skips_an_insertion_on_the_recognized_side', () => {
    // reference "the fox" vs recognized "the quick fox" (quick inserted)
    const pairs = alignTokens(['the', 'fox'], ['the', 'quick', 'fox']);

    expect(pairs).toEqual([
      { aIndex: 0, bIndex: 0 },
      { aIndex: 1, bIndex: 2 },
    ]);
  });

  it('never_matches_two_empty_normalized_tokens', () => {
    const pairs = alignTokens(['', 'word'], ['', 'word']);

    expect(pairs).toEqual([{ aIndex: 1, bIndex: 1 }]);
  });

  it('is_deterministic_for_a_repeated_word', () => {
    const first = alignTokens(['go', 'go', 'go'], ['go', 'go']);
    const second = alignTokens(['go', 'go', 'go'], ['go', 'go']);

    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
  });

  it('returns_no_pairs_for_two_completely_different_sequences', () => {
    expect(alignTokens(['alpha', 'beta'], ['gamma', 'delta'])).toEqual([]);
  });
});
