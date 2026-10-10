import { describe, expect, it } from 'vitest';

import { matchesAccepted, normalizeAnswer } from '../../src/activities/objective/answer-normalization';

const RIGHT_QUOTE = String.fromCharCode(0x2019);

describe('answer normalization', () => {
  it('matching_ignores_case', () => {
    expect(matchesAccepted('HAD LISTENED TO', ['had listened to'])).toBe(true);
  });

  it('matching_ignores_leading_and_trailing_whitespace', () => {
    expect(matchesAccepted('  \thad \n', ['Had'])).toBe(true);
  });

  it('inner_whitespace_runs_collapse', () => {
    expect(matchesAccepted('had   listened  to', ['had listened to'])).toBe(true);
  });

  it('typographic_apostrophes_match_ascii', () => {
    expect(matchesAccepted(`Hadn${RIGHT_QUOTE}t`, ["hadn't"])).toBe(true);
    expect(normalizeAnswer(`${String.fromCharCode(0x201c)}hi${String.fromCharCode(0x201d)}`)).toBe('"hi"');
  });

  it('nfc_and_nfd_forms_match', () => {
    expect(matchesAccepted('café', ['café'])).toBe(true);
  });

  it('any_accepted_variant_matches', () => {
    expect(matchesAccepted('had heard', ['had listened to', 'had heard'])).toBe(true);
  });

  it('a_different_word_does_not_match', () => {
    expect(matchesAccepted('would hear', ['had heard'])).toBe(false);
    expect(matchesAccepted('   ', ['had heard'])).toBe(false);
  });
});
