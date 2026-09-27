import { Injectable } from '@nestjs/common';
import type { CompetencyTrend, ProfileCompetency } from '@english-quest/shared';

import { PrismaService } from '../prisma/prisma.service';
import { ErrorLedgerReader, type LedgerEntry } from './error-ledger.reader';
import {
  PARTIAL_UPDATE_BLOCKED_NOTE,
  PARTIAL_UPDATE_FAILED_NOTE,
  PROFILE_COMPETENCIES,
  WARMING_UP_BELOW_MEASUREMENTS,
  type MeasurementSourceKind,
} from './profile.constants';

/** One competency as stored, unrounded — the route rounds, prompts and F20 read it as is. */
export interface CompetencySnapshot {
  competency: ProfileCompetency;
  /** Null with no measurement. */
  score: number | null;
  previousScore: number | null;
  measurementCount: number;
  warmingUp: boolean;
  trend: CompetencyTrend | null;
  lastMeasuredAt: Date | null;
  /** Pronunciation only. */
  accuracy: number | null;
  prosody: number | null;
}

export interface ProfileSnapshot {
  /** The last applied source; null when nothing has been ingested. */
  updatedAt: Date | null;
  /** No measurement and no ledger record. */
  empty: boolean;
  /** Always six, in the fixed competency order. */
  competencies: CompetencySnapshot[];
  recurringWeaknesses: LedgerEntry[];
  notes: string[];
}

export interface MeasurementPoint {
  competency: ProfileCompetency;
  sourceKind: MeasurementSourceKind;
  value: number;
  scoreAfter: number;
  accuracy: number | null;
  prosody: number | null;
  accuracyAfter: number | null;
  prosodyAfter: number | null;
  measuredAt: Date;
  lessonId: string | null;
  activityId: string | null;
}

function emptyCompetency(competency: ProfileCompetency): CompetencySnapshot {
  return {
    competency,
    score: null,
    previousScore: null,
    measurementCount: 0,
    warmingUp: true,
    trend: null,
    lastMeasuredAt: null,
    accuracy: null,
    prosody: null,
  };
}

/**
 * The profile snapshot and measurement history (F12), one owner at a time.
 * Everything it returns is read from the materialized rows the ingestion
 * engine keeps exact, so the profile route, F14, F15 and F20 all see the
 * same numbers.
 */
@Injectable()
export class LearningProfileReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: ErrorLedgerReader,
  ) {}

  async snapshotFor(userId: string, now: Date = new Date()): Promise<ProfileSnapshot> {
    const [profile, sourceCount, rows, entryCount, recurringWeaknesses, notes] = await Promise.all([
      this.prisma.learningProfile.findUnique({ where: { userId }, select: { updatedAt: true } }),
      this.prisma.profileSource.count({ where: { userId } }),
      this.prisma.profileCompetency.findMany({ where: { userId } }),
      this.prisma.errorLedgerEntry.count({ where: { userId } }),
      this.ledger.recurringFor(userId, now),
      this.notesFor(userId),
    ]);

    const byCompetency = new Map(rows.map((row) => [row.competency, row]));
    const competencies = PROFILE_COMPETENCIES.map((competency): CompetencySnapshot => {
      const row = byCompetency.get(competency);
      if (!row) {
        return emptyCompetency(competency);
      }
      return {
        competency,
        score: row.score,
        previousScore: row.previousScore,
        measurementCount: row.measurementCount,
        warmingUp: row.measurementCount < WARMING_UP_BELOW_MEASUREMENTS,
        trend: row.trend as CompetencyTrend | null,
        lastMeasuredAt: row.lastMeasuredAt,
        accuracy: row.accuracy,
        prosody: row.prosody,
      };
    });

    return {
      // The lock row can exist with nothing applied (a rebuild of an empty profile); only a source makes it an update.
      updatedAt: sourceCount > 0 ? (profile?.updatedAt ?? null) : null,
      empty: rows.length === 0 && entryCount === 0,
      competencies,
      recurringWeaknesses,
      notes,
    };
  }

  /**
   * Every measurement, in fold order, with the smoothed value after it —
   * F20's chart. `limit` keeps the most recent points.
   */
  async measurementHistory(
    userId: string,
    options: { competency?: ProfileCompetency; since?: Date; limit?: number } = {},
  ): Promise<MeasurementPoint[]> {
    const rows = await this.prisma.profileMeasurement.findMany({
      where: {
        userId,
        ...(options.competency ? { competency: options.competency } : {}),
        ...(options.since ? { measuredAt: { gte: options.since } } : {}),
      },
      orderBy: options.limit
        ? [{ measuredAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]
        : [{ measuredAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      ...(options.limit ? { take: options.limit } : {}),
      include: { source: { select: { lessonId: true, activityId: true } } },
    });
    const ordered = options.limit ? rows.reverse() : rows;
    return ordered.map((row) => ({
      competency: row.competency as ProfileCompetency,
      sourceKind: row.sourceKind as MeasurementSourceKind,
      value: row.value,
      scoreAfter: row.scoreAfter,
      accuracy: row.accuracy,
      prosody: row.prosody,
      accuracyAfter: row.accuracyAfter,
      prosodyAfter: row.prosodyAfter,
      measuredAt: row.measuredAt,
      lessonId: row.source.lessonId,
      activityId: row.source.activityId,
    }));
  }

  /**
   * The partial-update note, derived at read time: the owner's most recent
   * lesson reached the profile through its pronunciation result only, and
   * that lesson's analysis is blocked on a key or failed. The pronunciation
   * dimension moved; the other five are waiting on the analysis.
   */
  private async notesFor(userId: string): Promise<string[]> {
    const latest = await this.prisma.profileSource.findFirst({
      where: { userId, kind: { in: ['lesson_analysis', 'lesson_pronunciation'] } },
      orderBy: [{ occurredAt: 'desc' }, { ingestedAt: 'desc' }],
      select: { lessonId: true },
    });
    if (!latest?.lessonId) {
      return [];
    }
    const analysed = await this.prisma.profileSource.findUnique({
      where: { userId_kind_sourceKey: { userId, kind: 'lesson_analysis', sourceKey: latest.lessonId } },
      select: { id: true },
    });
    if (analysed) {
      return [];
    }
    const stage = await this.prisma.lessonPipelineStage.findFirst({
      where: { stage: 'lesson_analysis', branch: { lessonId: latest.lessonId, userId } },
      select: { status: true },
    });
    if (stage?.status === 'blocked_missing_key') {
      return [PARTIAL_UPDATE_BLOCKED_NOTE];
    }
    if (stage?.status === 'failed') {
      return [PARTIAL_UPDATE_FAILED_NOTE];
    }
    return [];
  }
}
