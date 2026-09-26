import { describe, expect, it } from 'vitest';

import { correctionSegments } from '../../src/analysis/correction-diff';

describe('correctionSegments', () => {
  it('emphasizes_the_substituted_word', () => {
    expect(
      correctionSegments(
        'if I would have known, I would have booked earlier',
        'if I had known, I would have booked earlier',
      ),
    ).toEqual([
      { text: 'if I', changed: false },
      { text: 'had', changed: true },
      { text: 'known, I would have booked earlier', changed: false },
    ]);
  });

  it('ignores_case_and_punctuation_when_matching', () => {
    expect(correctionSegments("I've went there.", "I've gone there")).toEqual([
      { text: "I've", changed: false },
      { text: 'gone', changed: true },
      { text: 'there', changed: false },
    ]);
    expect(correctionSegments('she dont LIKE it', 'She doesn’t like it.')).toEqual([
      { text: 'She', changed: false },
      { text: 'doesn’t', changed: true },
      { text: 'like it.', changed: false },
    ]);
  });

  it('marks_everything_when_nothing_is_shared', () => {
    expect(correctionSegments('gonna do it', 'I intend to leave')).toEqual([
      { text: 'I intend to leave', changed: true },
    ]);
  });

  it('an_identical_correction_has_no_change', () => {
    expect(correctionSegments('the bottom line is', 'the bottom line is')).toEqual([
      { text: 'the bottom line is', changed: false },
    ]);
  });

  it('segments_join_back_to_the_correction', () => {
    const cases: Array<[string, string]> = [
      ['if I would have known, I would have booked earlier', 'if I had known, I would have booked earlier'],
      ['He  said me   that', 'He told me\tthat'],
      ['we discussed about the budget', 'we discussed the budget'],
      ['', 'A whole new sentence'],
      ['one two three', 'three two one'],
    ];
    for (const [quote, correction] of cases) {
      const joined = correctionSegments(quote, correction)
        .map((segment) => segment.text)
        .join(' ');
      expect(joined).toBe(correction.split(/\s+/).filter(Boolean).join(' '));
    }
    expect(correctionSegments('anything', '   ')).toEqual([]);
  });

  it('an_inserted_word_is_changed_and_a_dropped_word_leaves_no_trace', () => {
    expect(correctionSegments('we discussed about the budget', 'we discussed the budget')).toEqual([
      { text: 'we discussed the budget', changed: false },
    ]);
    expect(correctionSegments('I agree', 'I totally agree')).toEqual([
      { text: 'I', changed: false },
      { text: 'totally', changed: true },
      { text: 'agree', changed: false },
    ]);
  });
});
