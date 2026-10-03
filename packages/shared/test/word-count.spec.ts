import { describe, expect, it } from 'vitest';

import { countWords, wordTokens } from '../src/schemas/writing';

describe('countWords', () => {
  it('counts_space_separated_words', () => {
    expect(countWords('The quick brown fox jumps')).toBe(5);
  });

  it('an_internal_apostrophe_or_hyphen_keeps_one_word', () => {
    expect(countWords("don't")).toBe(1);
    expect(countWords('don’t')).toBe(1);
    expect(countWords('well-known')).toBe(1);
    expect(wordTokens("don't stop well-known")).toEqual(["don't", 'stop', 'well-known']);
  });

  it('punctuation_and_symbols_are_not_words', () => {
    expect(countWords('wait + go — really… now')).toBe(4);
  });

  it('numbers_are_words', () => {
    expect(countWords('I have 3 apples and 12 oranges')).toBe(7);
  });

  it('newlines_and_repeated_spaces_separate_words', () => {
    expect(countWords('one\n\ntwo   three\r\nfour')).toBe(4);
  });

  it('an_empty_or_blank_text_has_zero_words', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n\t  ')).toBe(0);
  });

  it('emoji_are_not_words', () => {
    expect(countWords('great job \u{1F600}\u{1F44D}')).toBe(2);
  });
});
