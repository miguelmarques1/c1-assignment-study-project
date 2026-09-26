import type { AssessedWord, PronunciationWordBand } from '@english-quest/shared';

import type { StoredWord } from './excerpt-assessment.store';
import { PHONEME_FAILURE_THRESHOLD, WORD_BAND_GOOD_MIN } from './pronunciation.constants';

/**
 * A word's colour band from its accuracy rounded to an integer (F19, A16),
 * so the band always agrees with the number shown beside it.
 */
export function wordBand(accuracy: number): PronunciationWordBand {
  const rounded = Math.round(accuracy);
  if (rounded >= WORD_BAND_GOOD_MIN) {
    return 'good';
  }
  return rounded >= PHONEME_FAILURE_THRESHOLD ? 'fair' : 'poor';
}

/** The transcript badge's word detail: what a client colours, without phonemes or clip offsets. */
export function toAssessedWords(words: readonly StoredWord[]): AssessedWord[] {
  return words.map((word) => ({
    text: word.word,
    accuracy: Math.round(word.accuracy),
    errorTypes: word.errorTypes,
    band: wordBand(word.accuracy),
  }));
}
