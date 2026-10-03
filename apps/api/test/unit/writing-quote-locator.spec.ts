import { describe, expect, it } from 'vitest';

import { locateQuote } from '../../src/writing/output/quote-locator';

const NONE = new Set<number>();

describe('locateQuote', () => {
  it('finds_an_exact_quote', () => {
    const text = 'The cat sat on the mat.';
    expect(locateQuote(text, 'sat on the mat', NONE)).toEqual({ start: 8, end: 22 });
  });

  it('finds_a_quote_despite_curly_apostrophes_case_and_spacing', () => {
    const text = "I think it's a great idea, honestly.";
    expect(locateQuote(text, "IT’S   a great", NONE)).toEqual({ start: 8, end: 20 });
  });

  it('returns_the_texts_own_span_not_the_models_spelling', () => {
    const text = 'I really don’t think that is fair.';
    // The model quotes it with a straight apostrophe; the text's own span keeps the curly one it was written with.
    const span = locateQuote(text, "don't think", NONE)!;
    expect(text.slice(span.start, span.end)).toBe('don’t think');
  });

  it('prefers_an_unclaimed_occurrence_of_a_repeated_quote', () => {
    const text = 'I said hello and then I said hello again.';
    const first = locateQuote(text, 'I said hello', NONE)!;
    expect(first.start).toBe(0);
    const second = locateQuote(text, 'I said hello', new Set([first.start]))!;
    expect(second.start).toBeGreaterThan(first.start);
    expect(text.slice(second.start, second.end)).toBe('I said hello');
  });

  it('does_not_match_an_ellipsis_quote', () => {
    const text = 'The council decided to build a car park instead of a park.';
    expect(locateQuote(text, 'The council ... a car park', NONE)).toBeNull();
  });

  it('does_not_match_a_paraphrase', () => {
    const text = 'The council decided to build a car park instead of a park.';
    expect(locateQuote(text, 'The board chose to construct a parking lot', NONE)).toBeNull();
  });
});
