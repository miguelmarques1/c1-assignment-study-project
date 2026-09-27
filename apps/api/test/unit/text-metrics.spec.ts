import { describe, expect, it } from 'vitest';

import { buildFrequencyList } from '../../src/generation/text/frequency-list';
import {
  lookupStem,
  measureText,
  normalizeForMatch,
  normalizeQuote,
  sentences,
  words,
} from '../../src/generation/text/text-metrics';

/** A controlled list: each lemma's rank is its position, so tests choose which band a word falls in. */
function listOf(ranked: Record<string, number>) {
  return buildFrequencyList(new Map(Object.entries(ranked)), 'test');
}

describe('text metrics', () => {
  it('counts_words_with_internal_apostrophes_hyphens_and_decimals_as_one', () => {
    expect(words("Don't call it well-known: 3.5 million people’s choice.")).toEqual([
      "Don't",
      'call',
      'it',
      'well-known',
      '3.5',
      'million',
      'people’s',
      'choice',
    ]);
  });

  it('splits_sentences_on_terminal_punctuation_and_paragraph_breaks', () => {
    const text = 'The vote failed. Nobody was surprised!\n\nA heading without a period\nstill ends at the blank line?\n\nLast one';

    expect(sentences(text)).toEqual([
      'The vote failed.',
      'Nobody was surprised!',
      'A heading without a period still ends at the blank line?',
      'Last one',
    ]);
  });

  it('does_not_split_after_abbreviations_initials_or_decimals', () => {
    const text = 'Dr. Smith met J. K. Rowling in 2019. They spoke of 3.5 million readers, e.g. students. I agreed.';

    expect(sentences(text)).toEqual([
      'Dr. Smith met J. K. Rowling in 2019.',
      'They spoke of 3.5 million readers, e.g. students.',
      'I agreed.',
    ]);
  });

  it('splits_after_closing_quotes_and_before_opening_ones', () => {
    expect(sentences('She said, "Leave now." "Why?" he asked.')).toEqual(['She said, "Leave now."', '"Why?" he asked.']);
  });

  it('mean_sentence_length_is_words_over_sentences', () => {
    const measured = measureText('One two three four. Five six.', listOf({}), 3000);

    expect(measured.wordCount).toBe(6);
    expect(measured.sentenceCount).toBe(2);
    expect(measured.meanSentenceLength).toBe(3);
  });

  it('type_token_ratio_is_case_insensitive_over_alphabetic_words', () => {
    const measured = measureText('The the THE cat sat in 2019.', listOf({}), 3000);

    // Alphabetic words: the, the, the, cat, sat, in → 4 types over 6 tokens; 2019 is excluded.
    expect(measured.typeTokenRatio).toBeCloseTo(4 / 6);
  });

  it('out_of_frequency_ratio_counts_words_ranked_beyond_the_cutoff', () => {
    const list = listOf({ the: 1, cat: 900, sat: 1500, on: 2500, mat: 4000 });
    const measured = measureText('The cat sat on the mat of velvet.', list, 3000);

    // Counted: the, cat, sat, on, the, mat, of, velvet = 8; beyond 3,000 or unlisted: mat, of, velvet = 3.
    expect(measured.frequencyCounted).toBe(8);
    expect(measured.outOfFrequencyRatio).toBeCloseTo(3 / 8);
    expect(measured.frequencyBands).toEqual({ k1: 3 / 8, k2: 1 / 8, k3: 1 / 8, k4_5: 1 / 8, off_list: 2 / 8 });
  });

  it('excludes_numbers_acronyms_and_mid_sentence_names_from_the_ratio', () => {
    const list = listOf({ the: 1, report: 10, from: 2, was: 3, be: 3, published: 20, publish: 20, in: 4 });
    const measured = measureText('The report from NATO and Halden was published in 2019.', list, 3000);

    // `and` is not in this list and counts; NATO, Halden and 2019 do not count at all.
    expect(measured.frequencyCounted).toBe(7);
    expect(measured.outOfFrequencyRatio).toBeCloseTo(1 / 7);
  });

  it('a_capitalised_sentence_start_is_counted_even_when_unlisted', () => {
    const measured = measureText('Halden resigned.', listOf({ resign: 5 }), 3000);

    expect(measured.frequencyCounted).toBe(2);
    expect(measured.outOfFrequencyRatio).toBeCloseTo(1 / 2);
  });

  it('looks_up_contractions_by_their_stem', () => {
    expect(lookupStem("wouldn't")).toBe('would');
    expect(lookupStem("won't")).toBe('will');
    expect(lookupStem("can't")).toBe('can');
    expect(lookupStem("it's")).toBe('it');
    expect(lookupStem("they're")).toBe('they');

    const measured = measureText("They wouldn't go.", listOf({ they: 1, would: 2, go: 3 }), 3000);
    expect(measured.outOfFrequencyRatio).toBe(0);
  });

  it('a_hyphenated_compound_is_outside_when_any_part_is', () => {
    const list = listOf({ well: 100, know: 50, known: 50, ultra: 4500 });

    expect(measureText('Well-known.', list, 3000).outOfFrequencyRatio).toBe(0);
    expect(measureText('Ultra-granular.', list, 3000).outOfFrequencyRatio).toBe(1);
  });

  it('band_shares_sum_to_one', () => {
    const list = listOf({ a: 1, b: 1200, c: 2600, d: 4200 });
    const { frequencyBands } = measureText('A b c d e.', list, 3000);

    const total = Object.values(frequencyBands).reduce((sum, value) => sum + value, 0);
    expect(total).toBeCloseTo(1);
  });

  it('normalizes_quotes_dashes_and_whitespace_for_matching', () => {
    expect(normalizeForMatch('It’s  “Fine” — really…')).toBe(normalizeForMatch('it\'s "fine" - really...'));
    expect(normalizeQuote('  “Had we known,”  ')).toBe('had we known');
  });
});
