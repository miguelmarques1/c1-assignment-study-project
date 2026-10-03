import { normalizeToken } from '../../excerpts/excerpt-tokens';

/** One token as it should be shown: the original spelling, plus its normalized form for alignment (A11). */
export interface DisplayToken {
  text: string;
  normalized: string;
}

/** Splits raw prose into display tokens, one per whitespace-delimited word, in F09's normalized form. */
export function tokenizeDisplay(text: string): DisplayToken[] {
  return text
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => ({ text: token, normalized: normalizeToken(token) }));
}

export interface AlignedPair {
  aIndex: number;
  bIndex: number;
}

/**
 * The longest common subsequence between two normalized-token sequences,
 * returned as index pairs in ascending order on both sides. Deterministic
 * and exact: two tokens match only on identical normalized form, never by
 * edit distance or phonetic similarity. An empty normalized form (a token
 * that was only punctuation) never matches anything, including another
 * empty one.
 */
export function alignTokens(a: readonly string[], b: readonly string[]): AlignedPair[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] =
        a[i] === b[j] && a[i]!.length > 0 ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const pairs: AlignedPair[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j] && a[i]!.length > 0) {
      pairs.push({ aIndex: i, bIndex: j });
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return pairs;
}
