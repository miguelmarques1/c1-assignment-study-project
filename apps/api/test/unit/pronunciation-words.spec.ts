import { describe, expect, it } from 'vitest';

import { toAssessedWords, wordBand } from '../../src/pronunciation/pronunciation-words';

describe('pronunciation words', () => {
  it('bands_follow_the_rounded_accuracy', () => {
    expect(wordBand(59.4)).toBe('poor');
    expect(wordBand(59.6)).toBe('fair');
    expect(wordBand(79.4)).toBe('fair');
    expect(wordBand(79.5)).toBe('good');
    expect(wordBand(80)).toBe('good');
    expect(wordBand(0)).toBe('poor');
    expect(wordBand(100)).toBe('good');
  });

  it('projects_stored_words_without_phonemes_or_offsets', () => {
    const projected = toAssessedWords([
      {
        word: 'postponed',
        accuracy: 54.2,
        errorTypes: ['Mispronunciation'],
        offsetMs: 1_200,
        durationMs: 480,
        phonemes: [{ phoneme: 'p', accuracy: 40, offsetMs: 1_200, durationMs: 60 }],
      },
      { word: 'budget', accuracy: 71.4, errorTypes: [], offsetMs: 1_700, durationMs: 300, phonemes: [] },
    ]);

    expect(projected).toEqual([
      { text: 'postponed', accuracy: 54, errorTypes: ['Mispronunciation'], band: 'poor' },
      { text: 'budget', accuracy: 71, errorTypes: [], band: 'fair' },
    ]);
    for (const word of projected) {
      expect(Object.keys(word).sort()).toEqual(['accuracy', 'band', 'errorTypes', 'text']);
    }
  });
});
