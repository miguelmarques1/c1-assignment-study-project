import { Injectable } from '@nestjs/common';

/**
 * A participant's pronunciation targets as the selection ranks against
 * them. `source` names where they came from, and it is stored with every
 * selection, because the tags are an input: the same utterances, rules and
 * focus always select the same excerpts.
 */
export interface PronunciationFocus {
  source: string;
  /** The unmastered pronunciation tags, e.g. `phoneme:/θ/`. */
  tags: readonly string[];
  /** Whether a normalized token exercises one of `tags`. */
  matchesWord(token: string): boolean;
}

/** The focus while no ledger exists: no tags, so the ranking key is 0 for every utterance. */
export const NO_PRONUNCIATION_FOCUS: PronunciationFocus = {
  source: 'none',
  tags: [],
  matchesWord: () => false,
};

/**
 * F12's seam. The error ledger that holds a participant's unmastered
 * pronunciation tags, and the taxonomy those tags come from, arrive with
 * F12 (wave 9), after this feature. Until then this returns no focus, and
 * the ranking falls through to duration. F12 replaces this implementation
 * with a read of the owner's ledger, and owns how a word is matched to a
 * tag (a pronunciation lexicon, or the phonemes F10 observes per word),
 * without reopening this feature. It must only ever read `userId`'s data.
 */
@Injectable()
export class PronunciationFocusPort {
  async focusFor(_userId: string): Promise<PronunciationFocus> {
    return NO_PRONUNCIATION_FOCUS;
  }
}
