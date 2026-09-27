import { Injectable } from '@nestjs/common';
import type {
  CompetencySnapshotView,
  LearningProfileView,
  LedgerEntryDetailView,
  LedgerEntryListView,
  LedgerEntryView,
} from '@english-quest/shared';

import { AppError } from '../common/app-error';
import { ErrorLedgerReader, type LedgerEntry } from './error-ledger.reader';
import { LearningProfileReader, type CompetencySnapshot } from './learning-profile.reader';
import { roundScore, scoreDelta } from './profile-fold';

function iso(date: Date): string {
  return date.toISOString();
}

function toCompetencyView(entry: CompetencySnapshot): CompetencySnapshotView {
  const subScores =
    entry.competency === 'pronunciation' && entry.accuracy !== null
      ? { accuracy: roundScore(entry.accuracy), prosody: entry.prosody === null ? null : roundScore(entry.prosody) }
      : null;
  return {
    competency: entry.competency,
    score: entry.score === null ? null : roundScore(entry.score),
    delta: scoreDelta(entry.score, entry.previousScore),
    measurementCount: entry.measurementCount,
    warmingUp: entry.warmingUp,
    trend: entry.trend,
    lastMeasuredAt: entry.lastMeasuredAt ? iso(entry.lastMeasuredAt) : null,
    subScores,
  };
}

function toEntryView(entry: LedgerEntry): LedgerEntryView {
  return {
    id: entry.id,
    tag: entry.tag,
    label: entry.label,
    family: entry.family,
    occurrenceCount: entry.occurrenceCount,
    recentOccurrenceCount: entry.recentOccurrenceCount,
    firstSeenAt: iso(entry.firstSeenAt),
    lastSeenAt: iso(entry.lastSeenAt),
    state: entry.state,
    dueAt: entry.dueAt ? iso(entry.dueAt) : null,
    trend: entry.trend,
    retired: entry.retired,
  };
}

/**
 * The profile routes' policy (F12): the caller's own snapshot and ledger,
 * rounded the one way every client shows them, with the server's clock for
 * relative dates. There is no user id in any request — every read is keyed
 * by the session's user, so no response can carry anyone else's data.
 */
@Injectable()
export class ProfileService {
  constructor(
    private readonly profiles: LearningProfileReader,
    private readonly ledger: ErrorLedgerReader,
  ) {}

  async getProfile(userId: string, now: Date = new Date()): Promise<LearningProfileView> {
    const snapshot = await this.profiles.snapshotFor(userId, now);
    return {
      serverTime: iso(now),
      updatedAt: snapshot.updatedAt ? iso(snapshot.updatedAt) : null,
      empty: snapshot.empty,
      competencies: snapshot.competencies.map(toCompetencyView),
      recurringWeaknesses: snapshot.recurringWeaknesses.map(toEntryView),
      notes: snapshot.notes,
    };
  }

  async listLedger(userId: string, tag: string | undefined, now: Date = new Date()): Promise<LedgerEntryListView> {
    const entries = await this.ledger.entriesFor(userId, { ...(tag ? { tags: [tag] } : {}), now });
    return { serverTime: iso(now), entries: entries.map(toEntryView) };
  }

  async getLedgerEntry(userId: string, entryId: string, now: Date = new Date()): Promise<LedgerEntryDetailView> {
    const detail = await this.ledger.detailFor(userId, entryId, now);
    if (!detail) {
      throw AppError.ledgerEntryNotFound();
    }
    return {
      serverTime: iso(now),
      entry: toEntryView(detail.entry),
      examples: detail.examples.map((example) => ({ ...example, occurredAt: iso(example.occurredAt) })),
      sources: detail.sources.map((source) => ({ ...source, occurredAt: iso(source.occurredAt) })),
    };
  }
}
