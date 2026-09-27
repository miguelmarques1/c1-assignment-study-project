import { Injectable } from '@nestjs/common';
import type { LedgerSourceKind, LedgerState, TagTrend } from '@english-quest/shared';
import { z } from 'zod';

import { PrismaService } from '../prisma/prisma.service';
import { ErrorTaxonomyService } from '../taxonomy/error-taxonomy.service';
import { selectRecurring, tagTrend, windowCounts } from './ledger-rules';
import { DAY_MS, LEDGER_EXAMPLE_LIMIT, RECURRING_WINDOW_DAYS } from './profile.constants';

const exampleWordsSchema = z.array(z.string());

export interface LedgerEntry {
  id: string;
  tag: string;
  /** From the taxonomy in force, or the stored snapshot once retired. */
  label: string;
  family: string;
  occurrenceCount: number;
  /** Within the last 30 days. */
  recentOccurrenceCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  state: LedgerState;
  /** Always null in Core. */
  dueAt: Date | null;
  trend: TagTrend;
  /** No longer in the taxonomy in force: read-only history. */
  retired: boolean;
  taxonomyVersion: string;
}

export interface LedgerExample {
  sourceKind: LedgerSourceKind;
  lessonId: string | null;
  activityId: string | null;
  occurredAt: Date;
  quote: string | null;
  correction: string | null;
  exampleWords: string[];
  instances: number;
}

export interface LedgerSource {
  sourceKind: LedgerSourceKind;
  lessonId: string | null;
  activityId: string | null;
  occurredAt: Date;
  occurrences: number;
}

export interface LedgerEntryDetail {
  entry: LedgerEntry;
  /** Up to 5, most recent first: occurrences with a quote or example words. */
  examples: LedgerExample[];
  /** Every lesson or activity with an occurrence of this tag, most recent first. */
  sources: LedgerSource[];
}

/** One example per tag, for the compact summary. */
export interface LatestTagExample {
  tag: string;
  quote: string | null;
  exampleWords: string[];
}

interface OccurrenceRow {
  sourceId: string;
  lessonId: string | null;
  activityId: string | null;
  occurredAt: Date;
  quote: string | null;
  correction: string | null;
  exampleWords: unknown;
  instances: number;
}

function hasExample(row: { quote: string | null; exampleWords: string[] }): boolean {
  return row.quote !== null || row.exampleWords.length > 0;
}

/**
 * The read side of the error ledger (F12), always one owner at a time. The
 * routes, the seams (`ProfileTagsPort`, `PronunciationFocusPort`,
 * `ErrorLedgerPort`), the compact summary, and later F14, F15 and F20 all
 * read through it, so the 30-day counts, the trend and "retired" are
 * computed in exactly one place and two views can never diverge.
 */
@Injectable()
export class ErrorLedgerReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taxonomy: ErrorTaxonomyService,
  ) {}

  isRetired(tag: string): boolean {
    return !this.taxonomy.has(tag);
  }

  /** Non-retired records first, then retired ones, each by last seen, most recent first. */
  async entriesFor(
    userId: string,
    options: { tags?: readonly string[]; includeRetired?: boolean; now?: Date } = {},
  ): Promise<LedgerEntry[]> {
    const now = options.now ?? new Date();
    const rows = await this.prisma.errorLedgerEntry.findMany({
      where: { userId, ...(options.tags ? { tag: { in: [...options.tags] } } : {}) },
    });
    if (rows.length === 0) {
      return [];
    }

    const since = new Date(now.getTime() - 2 * RECURRING_WINDOW_DAYS * DAY_MS);
    const recent = await this.prisma.errorLedgerOccurrence.findMany({
      where: { userId, tag: { in: rows.map((row) => row.tag) }, occurredAt: { gte: since } },
      select: { tag: true, occurredAt: true },
    });
    const timesByTag = new Map<string, Date[]>();
    for (const occurrence of recent) {
      const times = timesByTag.get(occurrence.tag);
      if (times) {
        times.push(occurrence.occurredAt);
      } else {
        timesByTag.set(occurrence.tag, [occurrence.occurredAt]);
      }
    }

    const entries = rows
      .map((row): LedgerEntry => {
        const counts = windowCounts(timesByTag.get(row.tag) ?? [], now);
        const retired = this.isRetired(row.tag);
        return {
          id: row.id,
          tag: row.tag,
          label: retired ? row.label : this.taxonomy.labelOf(row.tag),
          family: row.family,
          occurrenceCount: row.occurrenceCount,
          recentOccurrenceCount: counts.recent,
          firstSeenAt: row.firstSeenAt,
          lastSeenAt: row.lastSeenAt,
          state: row.state as LedgerState,
          dueAt: row.dueAt,
          trend: tagTrend(counts),
          retired,
          taxonomyVersion: row.taxonomyVersion,
        };
      })
      .filter((entry) => options.includeRetired !== false || !entry.retired);

    return entries.sort(
      (a, b) =>
        Number(a.retired) - Number(b.retired) ||
        b.lastSeenAt.getTime() - a.lastSeenAt.getTime() ||
        (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0),
    );
  }

  /** One of the owner's own records with its examples and sources; null for an unknown id or another user's. */
  async detailFor(userId: string, entryId: string, now: Date = new Date()): Promise<LedgerEntryDetail | null> {
    const row = await this.prisma.errorLedgerEntry.findFirst({ where: { id: entryId, userId }, select: { tag: true } });
    if (!row) {
      return null;
    }
    const [entry] = await this.entriesFor(userId, { tags: [row.tag], now });
    if (!entry) {
      return null;
    }

    const occurrences: OccurrenceRow[] = await this.prisma.errorLedgerOccurrence.findMany({
      where: { userId, tag: row.tag },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      select: {
        sourceId: true,
        lessonId: true,
        activityId: true,
        occurredAt: true,
        quote: true,
        correction: true,
        exampleWords: true,
        instances: true,
      },
    });

    const examples: LedgerExample[] = [];
    const sources = new Map<string, LedgerSource>();
    for (const occurrence of occurrences) {
      const sourceKind: LedgerSourceKind = occurrence.lessonId ? 'lesson' : 'activity';
      const example = {
        sourceKind,
        lessonId: occurrence.lessonId,
        activityId: occurrence.activityId,
        occurredAt: occurrence.occurredAt,
        quote: occurrence.quote,
        correction: occurrence.correction,
        exampleWords: exampleWordsSchema.parse(occurrence.exampleWords),
        instances: occurrence.instances,
      };
      if (examples.length < LEDGER_EXAMPLE_LIMIT && hasExample(example)) {
        examples.push(example);
      }
      const source = sources.get(occurrence.sourceId);
      if (source) {
        source.occurrences += 1;
      } else {
        sources.set(occurrence.sourceId, {
          sourceKind,
          lessonId: occurrence.lessonId,
          activityId: occurrence.activityId,
          occurredAt: occurrence.occurredAt,
          occurrences: 1,
        });
      }
    }

    return { entry, examples, sources: [...sources.values()] };
  }

  /** Every non-retired tag not `mastered` — in Core, every non-retired tag in the ledger. F14 and F15's guardrail. */
  async unmasteredTags(userId: string): Promise<string[]> {
    const entries = await this.entriesFor(userId, { includeRetired: false });
    return entries
      .filter((entry) => entry.state !== 'mastered')
      .map((entry) => entry.tag)
      .sort();
  }

  /** Records whose re-presentation is due. Core never schedules one, so this is empty until the Full scope. */
  async dueEntries(userId: string, now: Date = new Date()): Promise<LedgerEntry[]> {
    const due = await this.prisma.errorLedgerEntry.findMany({
      where: { userId, dueAt: { lte: now }, state: { not: 'mastered' } },
      select: { tag: true },
    });
    if (due.length === 0) {
      return [];
    }
    return this.entriesFor(userId, { tags: due.map((row) => row.tag), includeRetired: false, now });
  }

  /** Unmastered, non-retired tags with at least 3 occurrences in the last 30 days, ranked. */
  async recurringFor(userId: string, now: Date = new Date()): Promise<LedgerEntry[]> {
    const entries = await this.entriesFor(userId, { includeRetired: false, now });
    return selectRecurring(entries, (tag) => this.isRetired(tag));
  }

  /** Each tag's most recent occurrence that carries a quote or example words, in the order `tags` is given. */
  async latestExamples(userId: string, tags: readonly string[]): Promise<LatestTagExample[]> {
    if (tags.length === 0) {
      return [];
    }
    const occurrences = await this.prisma.errorLedgerOccurrence.findMany({
      where: { userId, tag: { in: [...tags] } },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      select: { tag: true, quote: true, exampleWords: true },
    });
    const latest = new Map<string, LatestTagExample>();
    for (const occurrence of occurrences) {
      if (latest.has(occurrence.tag)) {
        continue;
      }
      const example = {
        tag: occurrence.tag,
        quote: occurrence.quote,
        exampleWords: exampleWordsSchema.parse(occurrence.exampleWords),
      };
      if (hasExample(example)) {
        latest.set(occurrence.tag, example);
      }
    }
    return tags.flatMap((tag) => {
      const example = latest.get(tag);
      return example ? [example] : [];
    });
  }

  /**
   * How often each of `tags` occurred across the user's most recent
   * `lastLessons` analysed lessons — the evidence F15's rationale sentences
   * quote ("appeared in N of your last M lessons"). "Analysed" means a
   * `lesson_analysis` profile source exists, so a lesson counts toward the
   * window even if it produced zero occurrences of a given tag. An entry is
   * returned for every requested tag, `{ lessons: 0, of, inLatest: false }`
   * when the tag never occurred there — evidence outside any lesson
   * (activity-sourced only) reads the same as no lesson evidence at all.
   */
  async lessonSightings(
    userId: string,
    tags: readonly string[],
    lastLessons = 5,
  ): Promise<Map<string, { lessons: number; of: number; inLatest: boolean }>> {
    if (tags.length === 0) {
      return new Map();
    }
    const recentLessons = await this.prisma.profileSource.findMany({
      where: { userId, kind: 'lesson_analysis' },
      orderBy: { occurredAt: 'desc' },
      take: lastLessons,
      select: { lessonId: true },
    });
    const lessonIds = recentLessons.flatMap((row) => (row.lessonId ? [row.lessonId] : []));
    const result = new Map<string, { lessons: number; of: number; inLatest: boolean }>();
    if (lessonIds.length === 0) {
      tags.forEach((tag) => result.set(tag, { lessons: 0, of: 0, inLatest: false }));
      return result;
    }
    const latestLessonId = lessonIds[0];

    const occurrences = await this.prisma.errorLedgerOccurrence.findMany({
      where: { userId, tag: { in: [...tags] }, lessonId: { in: lessonIds } },
      select: { tag: true, lessonId: true },
    });
    const lessonsByTag = new Map<string, Set<string>>();
    for (const occurrence of occurrences) {
      if (!occurrence.lessonId) {
        continue;
      }
      const set = lessonsByTag.get(occurrence.tag) ?? new Set<string>();
      set.add(occurrence.lessonId);
      lessonsByTag.set(occurrence.tag, set);
    }

    for (const tag of tags) {
      const lessons = lessonsByTag.get(tag) ?? new Set<string>();
      result.set(tag, { lessons: lessons.size, of: lessonIds.length, inLatest: lessons.has(latestLessonId!) });
    }
    return result;
  }
}
