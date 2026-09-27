import type { LedgerState, TagTrend } from '@english-quest/shared';

import { DAY_MS, RECURRING_MIN_OCCURRENCES, RECURRING_WINDOW_DAYS } from './profile.constants';

/** One occurrence of a tag, as the aggregate reads it. */
export interface RuleOccurrence {
  occurredAt: Date;
  /** Set for an occurrence an activity produced. */
  activityId: string | null;
}

/** One correct encounter of a tag (activities only). */
export interface RuleEncounter {
  occurredAt: Date;
}

export interface EntryAggregate {
  occurrenceCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  state: LedgerState;
}

/**
 * A ledger record is an aggregate of its occurrences, never a counter, so
 * replacing a source can take its occurrences back out. Null when no
 * occurrence remains: the record goes, and encounters alone never create one.
 *
 * The Core lifecycle: `new` while every piece of evidence comes from
 * lessons, `practicing` once the learner has worked on the tag in an
 * activity (an occurrence there, or a correct encounter). `mastered` needs
 * the multi-day confirmation of the Full scope, so Core never writes it.
 */
export function aggregateEntry(
  occurrences: readonly RuleOccurrence[],
  encounters: readonly RuleEncounter[],
): EntryAggregate | null {
  if (occurrences.length === 0) {
    return null;
  }
  let first = occurrences[0]!.occurredAt;
  let last = first;
  for (const occurrence of occurrences) {
    if (occurrence.occurredAt < first) {
      first = occurrence.occurredAt;
    }
    if (occurrence.occurredAt > last) {
      last = occurrence.occurredAt;
    }
  }
  const practiced = encounters.length > 0 || occurrences.some((occurrence) => occurrence.activityId !== null);
  return {
    occurrenceCount: occurrences.length,
    firstSeenAt: first,
    lastSeenAt: last,
    state: practiced ? 'practicing' : 'new',
  };
}

export interface WindowCounts {
  /** Within the last 30 days. */
  recent: number;
  /** In the 30 days before those. */
  previous: number;
}

/** Counts occurrences in the recurring window and the window before it, against the server's clock. */
export function windowCounts(occurredAt: readonly Date[], now: Date): WindowCounts {
  const windowMs = RECURRING_WINDOW_DAYS * DAY_MS;
  const recentFrom = now.getTime() - windowMs;
  const previousFrom = recentFrom - windowMs;
  let recent = 0;
  let previous = 0;
  for (const at of occurredAt) {
    const time = at.getTime();
    if (time >= recentFrom) {
      recent += 1;
    } else if (time >= previousFrom) {
      previous += 1;
    }
  }
  return { recent, previous };
}

/** The last 30 days against the 30 before — the one arrow the profile screen and F20's dashboard both show. */
export function tagTrend(counts: WindowCounts): TagTrend {
  if (counts.recent > counts.previous) {
    return 'rising';
  }
  if (counts.recent < counts.previous) {
    return 'falling';
  }
  return 'flat';
}

export interface RecurringCandidate {
  tag: string;
  occurrenceCount: number;
  recentOccurrenceCount: number;
  lastSeenAt: Date;
  state: LedgerState;
}

/**
 * Exactly the unmastered, non-retired tags with at least 3 occurrences in
 * the last 30 days, ranked by their total count (the number each row shows),
 * then by recency, then by tag so the order is total.
 */
export function selectRecurring<T extends RecurringCandidate>(entries: readonly T[], isRetired: (tag: string) => boolean): T[] {
  return entries
    .filter(
      (entry) =>
        entry.state !== 'mastered' &&
        !isRetired(entry.tag) &&
        entry.recentOccurrenceCount >= RECURRING_MIN_OCCURRENCES,
    )
    .sort(
      (a, b) =>
        b.occurrenceCount - a.occurrenceCount ||
        b.lastSeenAt.getTime() - a.lastSeenAt.getTime() ||
        (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0),
    );
}
