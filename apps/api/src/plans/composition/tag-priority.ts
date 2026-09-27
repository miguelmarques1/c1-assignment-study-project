/** Why a tag was chosen: due for review, a recurring weakness, or any other unmastered tag (spec A8). */
export type PlanTagSource = 'due' | 'recurring' | 'unmastered';

/** How often a tag showed up across the user's recent lessons (`ErrorLedgerReader.lessonSightings`, spec A14). */
export interface LessonSightings {
  /** Distinct lessons where the tag occurred, within the window. */
  lessons: number;
  /** The window actually considered — up to 5, fewer for a newer user. */
  of: number;
  /** Whether it occurred in the most recent lesson. */
  inLatest: boolean;
}

export interface RankedPlanTag {
  tag: string;
  family: string;
  source: PlanTagSource;
  /** 1-based position in the ranking. */
  rank: number;
  /** Null when the tag has no lesson evidence at all (activity-sourced only). */
  sightings: LessonSightings | null;
}

/** The ledger facts the ranking reads, one per non-retired record. */
export interface RankableEntry {
  tag: string;
  family: string;
  occurrenceCount: number;
  lastSeenAt: Date;
  /** Set only on entries from `dueEntries`; always null elsewhere (and always empty in F12 Core). */
  dueAt: Date | null;
}

export interface TagPriorityInput {
  /** `ErrorLedgerReader.unmasteredTags`: non-retired, not mastered. */
  unmasteredTags: readonly string[];
  /** `ErrorLedgerReader.entriesFor(…, { includeRetired: false })`. */
  entries: readonly RankableEntry[];
  /** `ErrorLedgerReader.recurringFor`, already in F12's rank order. */
  recurringTags: readonly string[];
  /** `ErrorLedgerReader.dueEntries`: empty until F12's lifecycle sets due dates. */
  due: readonly RankableEntry[];
  /** `ErrorLedgerReader.lessonSightings(userId, tags, 5)`, already fetched. */
  sightings: ReadonlyMap<string, LessonSightings>;
}

function byTag(a: { tag: string }, b: { tag: string }): number {
  return a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0;
}

/**
 * The learner's unmastered tags in the order the plan should target them
 * (spec A8, following F14's A8): tags due for review first (earliest due
 * first), then recurring weaknesses in F12's own order, then every other
 * unmastered tag by occurrence count, then recency. Every non-retired
 * family is eligible, `phoneme:` included — F15's task slots target it,
 * unlike F14's text generation. Pure and deterministic.
 */
export function rankPlanTags(input: TagPriorityInput): RankedPlanTag[] {
  const unmastered = new Set(input.unmasteredTags);
  const entries = new Map(input.entries.map((entry) => [entry.tag, entry]));
  const eligible = (tag: string): boolean => unmastered.has(tag) && entries.has(tag);

  const ordered: Array<{ tag: string; source: PlanTagSource }> = [];
  const seen = new Set<string>();
  const add = (tag: string, source: PlanTagSource): void => {
    if (!seen.has(tag) && eligible(tag)) {
      seen.add(tag);
      ordered.push({ tag, source });
    }
  };

  const dueByTag = new Map(input.due.map((entry) => [entry.tag, entry]));
  [...dueByTag.values()]
    .sort((a, b) => (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0) || byTag(a, b))
    .forEach((entry) => add(entry.tag, 'due'));
  input.recurringTags.forEach((tag) => add(tag, 'recurring'));
  [...input.entries]
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount || b.lastSeenAt.getTime() - a.lastSeenAt.getTime() || byTag(a, b))
    .forEach((entry) => add(entry.tag, 'unmastered'));

  return ordered.map(({ tag, source }, index) => ({
    tag,
    family: entries.get(tag)!.family,
    source,
    rank: index + 1,
    sightings: input.sightings.get(tag) ?? null,
  }));
}
