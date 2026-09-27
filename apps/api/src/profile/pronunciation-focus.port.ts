import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { normalizeToken } from '../excerpts/excerpt-tokens';
import { PrismaService } from '../prisma/prisma.service';
import { ErrorLedgerReader } from './error-ledger.reader';

/**
 * A participant's pronunciation targets as F09's selection ranks against
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

/** The ledger-backed focus's version, stored as `focus_source` so a selection records which matcher ranked it. */
export const LEDGER_FOCUS_SOURCE = 'ledger@1';

const assessedWordsSchema = z.array(
  z.object({ word: z.string(), phonemes: z.array(z.object({ phoneme: z.string() })) }),
);

/**
 * F09's seam, implemented from the error ledger (F12). The tags are the
 * owner's non-retired, unmastered `phoneme:` records. A word matches when
 * the IPA phonemes Azure aligned to that same (normalized) word, in any of
 * the owner's own assessed excerpts, include one of those tags — no
 * pronunciation lexicon, and nothing read beyond `userId`'s own data. A
 * word the owner was never assessed on never matches: the focus is F09's
 * second tiebreaker, so an unseen word costs precision, not correctness.
 */
@Injectable()
export class PronunciationFocusPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: ErrorLedgerReader,
  ) {}

  async focusFor(userId: string): Promise<PronunciationFocus> {
    const entries = await this.ledger.entriesFor(userId, { includeRetired: false });
    const tags = entries
      .filter((entry) => entry.family === 'phoneme' && entry.state !== 'mastered')
      .map((entry) => entry.tag)
      .sort();
    if (tags.length === 0) {
      return { source: LEDGER_FOCUS_SOURCE, tags: [], matchesWord: () => false };
    }

    const focusTags = new Set(tags);
    const matching = new Set<string>();
    const assessments = await this.prisma.lessonExcerptAssessment.findMany({
      where: { userId, status: 'assessed' },
      select: { words: true },
    });
    for (const assessment of assessments) {
      const parsed = assessedWordsSchema.safeParse(assessment.words);
      if (!parsed.success) {
        continue;
      }
      for (const word of parsed.data) {
        if (word.phonemes.some((phoneme) => focusTags.has(`phoneme:/${phoneme.phoneme}/`))) {
          const token = normalizeToken(word.word);
          if (token) {
            matching.add(token);
          }
        }
      }
    }

    return { source: LEDGER_FOCUS_SOURCE, tags, matchesWord: (token) => matching.has(token) };
  }
}
