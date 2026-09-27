/** Why a tag was chosen: due for review, a recurring weakness, or any other unmastered tag. */
export type TagSource = 'due' | 'recurring' | 'unmastered';

export interface RankedTag {
  tag: string;
  family: string;
  source: TagSource;
  /** 1-based position in the ranking. */
  rank: number;
  /** Whether the ledger holds a quoted example for it (error review needs one, spec A7). */
  hasQuote: boolean;
}

/** The ledger facts the ranking reads, one per non-retired record. */
export interface RankableEntry {
  tag: string;
  family: string;
  occurrenceCount: number;
  lastSeenAt: Date;
  dueAt: Date | null;
}

export interface TagRankingInput {
  /** `ErrorLedgerReader.unmasteredTags`: non-retired, not mastered. */
  unmasteredTags: readonly string[];
  /** `ErrorLedgerReader.entriesFor(…, { includeRetired: false })`. */
  entries: readonly RankableEntry[];
  /** `ErrorLedgerReader.recurringFor`, already in F12's rank order. */
  recurringTags: readonly string[];
  /** `ErrorLedgerReader.dueEntries`: empty until F12's lifecycle sets due dates. */
  due: readonly RankableEntry[];
  /** Tags with at least one quoted example (`latestExamples`). */
  quotedTags: ReadonlySet<string>;
  /** Families generation may target: those with `analysis: true`, never `phoneme`. */
  eligibleFamilies: ReadonlySet<string>;
}

function byTag(a: { tag: string }, b: { tag: string }): number {
  return a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0;
}

/**
 * The learner's unmastered tags in the order generation should target them
 * (spec A8): tags due for review first (earliest due first), then recurring
 * weaknesses in F12's own order, then every other unmastered tag by
 * occurrence count, then recency. Phoneme tags never appear, since a text
 * item cannot train a sound. Pure and deterministic.
 */
export function rankTags(input: TagRankingInput): RankedTag[] {
  const unmastered = new Set(input.unmasteredTags);
  const entries = new Map(input.entries.map((entry) => [entry.tag, entry]));
  const eligible = (tag: string): boolean => {
    const family = entries.get(tag)?.family;
    return unmastered.has(tag) && family !== undefined && input.eligibleFamilies.has(family);
  };

  const ordered: Array<{ tag: string; source: TagSource }> = [];
  const seen = new Set<string>();
  const add = (tag: string, source: TagSource): void => {
    if (!seen.has(tag) && eligible(tag)) {
      seen.add(tag);
      ordered.push({ tag, source });
    }
  };

  [...input.due]
    .sort((a, b) => (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0) || byTag(a, b))
    .forEach((entry) => add(entry.tag, 'due'));
  input.recurringTags.forEach((tag) => add(tag, 'recurring'));
  [...input.entries]
    .sort(
      (a, b) =>
        b.occurrenceCount - a.occurrenceCount || b.lastSeenAt.getTime() - a.lastSeenAt.getTime() || byTag(a, b),
    )
    .forEach((entry) => add(entry.tag, 'unmastered'));

  return ordered.map(({ tag, source }, index) => ({
    tag,
    family: entries.get(tag)!.family,
    source,
    rank: index + 1,
    hasQuote: input.quotedTags.has(tag),
  }));
}
