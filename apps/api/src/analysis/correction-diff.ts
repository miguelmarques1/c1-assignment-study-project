import type { CorrectionSegment } from '@english-quest/shared';

/**
 * Case- and punctuation-insensitive comparison key. A token that is all
 * punctuation (a dash, an ellipsis) keeps its raw text, so it only ever
 * matches itself rather than every other punctuation-only token. Exported
 * for `writing/output/revision-diff.ts` (F17), which compares words exactly
 * as this file's own segments do.
 */
export function matchKey(token: string): string {
  const letters = token.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  return letters === '' ? token : letters;
}

/**
 * Splits a correction into the spans a client emphasizes (F19, A15): a
 * word-level longest common subsequence against the quote, where every
 * correction word outside it is `changed`. Adjacent words with the same
 * flag merge into one segment, so the texts joined with single spaces give
 * back the correction with its whitespace normalized.
 */
export function correctionSegments(quote: string, correction: string): CorrectionSegment[] {
  const from = quote.split(/\s+/).filter(Boolean);
  const to = correction.split(/\s+/).filter(Boolean);
  if (to.length === 0) {
    return [];
  }
  const fromKeys = from.map(matchKey);
  const toKeys = to.map(matchKey);

  // lengths[i][j] = LCS length of from[i..] and to[j..].
  const lengths: number[][] = Array.from({ length: from.length + 1 }, () => new Array<number>(to.length + 1).fill(0));
  for (let i = from.length - 1; i >= 0; i--) {
    for (let j = to.length - 1; j >= 0; j--) {
      lengths[i]![j] =
        fromKeys[i] === toKeys[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }

  const kept = new Array<boolean>(to.length).fill(false);
  let i = 0;
  let j = 0;
  while (i < from.length && j < to.length) {
    if (fromKeys[i] === toKeys[j]) {
      kept[j] = true;
      i++;
      j++;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      i++;
    } else {
      j++;
    }
  }

  const segments: CorrectionSegment[] = [];
  to.forEach((word, index) => {
    const changed = !kept[index];
    const last = segments[segments.length - 1];
    if (last && last.changed === changed) {
      last.text = `${last.text} ${word}`;
    } else {
      segments.push({ text: word, changed });
    }
  });
  return segments;
}
