import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ErrorTaxonomyService } from '../taxonomy/error-taxonomy.service';
import { aggregateEntry, type RuleEncounter, type RuleOccurrence } from './ledger-rules';
import { foldCompetency } from './profile-fold';
import {
  activityOutcomeSchema,
  activitySource,
  profileSourceInputSchema,
  type ActivityOutcomeInput,
  type IngestionResult,
  type ProfileSourceInput,
} from './profile-ingestion.contract';
import { measurementSourceKindOf, PROFILE_TRANSACTION_TIMEOUT_MS, weightOf } from './profile.constants';

/** Below what a real score or sub-score can differ by: a refold rewrites only the rows it actually moved. */
const AFTER_EPSILON = 1e-4;

function moved(stored: number | null, folded: number | null): boolean {
  if (stored === null || folded === null) {
    return stored !== folded;
  }
  return Math.abs(stored - folded) > AFTER_EPSILON;
}

/**
 * `weight` round-trips through a `real` column (0.35 comes back as
 * 0.3499999940…); snapping it back keeps a refold identical to the fold that
 * wrote the row.
 */
function storedWeight(weight: number): number {
  return Math.round(weight * 1e6) / 1e6;
}

function groupByTag<T extends { tag: string }>(rows: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(row.tag);
    if (group) {
      group.push(row);
    } else {
      groups.set(row.tag, [row]);
    }
  }
  return groups;
}

/**
 * The learning profile's only writer (F12). Every source — a lesson's
 * analysis, a lesson's pronunciation result, an activity attempt — goes
 * through `applySource`, which:
 *
 * 1. takes the owner's per-user lock, so concurrent sources never fold from
 *    a stale read;
 * 2. skips a source already applied at the same revision (a pipeline retry,
 *    a double submission, the job and the stage racing), or replaces one
 *    applied at an older revision, whose evidence cascades away;
 * 3. rejects and logs tags outside the taxonomy in force, and ingests the
 *    rest;
 * 4. recomputes every affected competency as a fold over the owner's whole
 *    ordered measurement log, and every affected ledger record from its
 *    occurrences — a pure function of the evidence, so no replacement or
 *    reordering can leave a stale or double-counted value behind.
 */
@Injectable()
export class ProfileIngestionService {
  private readonly logger = new Logger(ProfileIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly taxonomy: ErrorTaxonomyService,
  ) {}

  /** Applies one source inside the caller's transaction. */
  async applySource(tx: Prisma.TransactionClient, input: ProfileSourceInput): Promise<IngestionResult> {
    const source = profileSourceInputSchema.parse(input);
    await this.lock(tx, source.userId);
    return this.applyLocked(tx, source);
  }

  /** Applies several sources in order, inside the caller's transaction — how the stage lands a lesson's two. */
  async applySources(tx: Prisma.TransactionClient, inputs: readonly ProfileSourceInput[]): Promise<IngestionResult[]> {
    const results: IngestionResult[] = [];
    for (const input of inputs) {
      results.push(await this.applySource(tx, input));
    }
    return results;
  }

  /**
   * The outcome ingestion contract F16, F17 and F18 call synchronously.
   * Given the caller's transaction, the activity's profile writes commit or
   * roll back with the attempt itself; otherwise it opens its own. Either
   * way the profile reflects the outcome by the time this returns.
   */
  async ingestActivityOutcome(outcome: ActivityOutcomeInput, tx?: Prisma.TransactionClient): Promise<IngestionResult> {
    const source = activitySource(activityOutcomeSchema.parse(outcome));
    if (tx) {
      return this.applySource(tx, source);
    }
    return this.prisma.$transaction((own) => this.applySource(own, source), {
      timeout: PROFILE_TRANSACTION_TIMEOUT_MS,
    });
  }

  /**
   * Refolds every competency and re-aggregates every ledger record of one
   * user from the logs, under the same lock. For evidence removed outside
   * the engine (a lesson deleted by hand cascades its sources away, but
   * leaves the materialized snapshot behind), and for the Full scope's
   * backfill.
   */
  async rebuild(userId: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        await this.lock(tx, userId);
        const [measured, materialized, occurred, recorded] = await Promise.all([
          tx.profileMeasurement.findMany({ where: { userId }, distinct: ['competency'], select: { competency: true } }),
          tx.profileCompetency.findMany({ where: { userId }, select: { competency: true } }),
          tx.errorLedgerOccurrence.findMany({ where: { userId }, distinct: ['tag'], select: { tag: true } }),
          tx.errorLedgerEntry.findMany({ where: { userId }, select: { tag: true } }),
        ]);
        await this.refold(tx, userId, new Set([...measured, ...materialized].map((row) => row.competency)));
        await this.reaggregate(tx, userId, new Set([...occurred, ...recorded].map((row) => row.tag)));
      },
      { timeout: PROFILE_TRANSACTION_TIMEOUT_MS },
    );
  }

  /**
   * The per-user lock: the owner's `learning_profiles` row, created on first
   * use, taken `FOR UPDATE` before anything is read. Held to the end of the
   * caller's transaction.
   */
  private async lock(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await tx.$executeRaw`INSERT INTO learning_profiles (user_id) VALUES (${userId}::uuid) ON CONFLICT (user_id) DO NOTHING`;
    await tx.$queryRaw`SELECT user_id FROM learning_profiles WHERE user_id = ${userId}::uuid FOR UPDATE`;
  }

  private async applyLocked(tx: Prisma.TransactionClient, source: ProfileSourceInput): Promise<IngestionResult> {
    const { userId } = source;
    const existing = await tx.profileSource.findUnique({
      where: { userId_kind_sourceKey: { userId, kind: source.kind, sourceKey: source.sourceKey } },
      select: {
        id: true,
        revision: true,
        measurements: { select: { competency: true } },
        occurrences: { select: { tag: true } },
        encounters: { select: { tag: true } },
      },
    });
    if (existing && existing.revision === source.revision) {
      return { outcome: 'skipped', rejectedTags: [] };
    }

    const competencies = new Set<string>();
    const tags = new Set<string>();
    if (existing) {
      // An encounter that goes away can take a record back from `practicing` to `new`.
      existing.measurements.forEach((row) => competencies.add(row.competency));
      existing.occurrences.forEach((row) => tags.add(row.tag));
      existing.encounters.forEach((row) => tags.add(row.tag));
      await tx.profileSource.delete({ where: { id: existing.id } });
    }

    const rejected = new Set<string>();
    const known = (tag: string): boolean => {
      if (this.taxonomy.has(tag)) {
        return true;
      }
      rejected.add(tag);
      return false;
    };
    const occurrences = source.occurrences.filter((occurrence) => known(occurrence.tag));
    const encounters = source.encounters.filter((encounter) => known(encounter.tag));
    const rejectedTags = [...rejected].sort();
    const taxonomyVersion = this.taxonomy.current().version;
    if (rejectedTags.length > 0) {
      // Tags and ids only: a quote is the learner's own sentence and never reaches a log.
      this.logger.warn(
        `Rejected ${rejectedTags.length} tag(s) outside taxonomy v${taxonomyVersion} for user ${userId}, ` +
          `${source.kind} ${source.sourceKey}${source.label ? ` (${source.label})` : ''}: ${rejectedTags.join(', ')}`,
      );
    }

    const created = await tx.profileSource.create({
      data: {
        userId,
        kind: source.kind,
        sourceKey: source.sourceKey,
        revision: source.revision,
        lessonId: source.lessonId,
        activityId: source.activityId,
        occurredAt: source.occurredAt,
        taxonomyVersion,
        measurementCount: source.measurements.length,
        occurrenceCount: occurrences.length,
        encounterCount: encounters.length,
        rejectedTags,
      },
      select: { id: true },
    });

    const weight = weightOf(source.kind);
    const sourceKind = measurementSourceKindOf(source.kind);
    if (source.measurements.length > 0) {
      await tx.profileMeasurement.createMany({
        data: source.measurements.map((measurement) => ({
          userId,
          sourceId: created.id,
          competency: measurement.competency,
          sourceKind,
          weight,
          value: measurement.value,
          accuracy: measurement.accuracy,
          prosody: measurement.prosody,
          measuredAt: source.occurredAt,
          // Placeholders, rewritten by the refold below in this same transaction.
          scoreAfter: measurement.value,
          accuracyAfter: measurement.accuracy,
          prosodyAfter: measurement.prosody,
        })),
      });
      source.measurements.forEach((measurement) => competencies.add(measurement.competency));
    }
    if (occurrences.length > 0) {
      await tx.errorLedgerOccurrence.createMany({
        data: occurrences.map((occurrence) => ({
          userId,
          sourceId: created.id,
          tag: occurrence.tag,
          lessonId: source.lessonId,
          activityId: source.activityId,
          quote: occurrence.quote,
          correction: occurrence.correction,
          severity: occurrence.severity,
          exampleWords: occurrence.exampleWords.slice(0, 5),
          instances: occurrence.instances,
          analysisErrorId: occurrence.analysisErrorId,
          utteranceId: occurrence.utteranceId,
          occurredAt: source.occurredAt,
        })),
      });
      occurrences.forEach((occurrence) => tags.add(occurrence.tag));
    }
    if (encounters.length > 0) {
      await tx.errorLedgerEncounter.createMany({
        data: encounters.map((encounter) => ({
          userId,
          sourceId: created.id,
          tag: encounter.tag,
          activityId: source.activityId!,
          occurredAt: source.occurredAt,
        })),
      });
      encounters.forEach((encounter) => tags.add(encounter.tag));
    }

    await this.refold(tx, userId, competencies);
    await this.reaggregate(tx, userId, tags);
    await tx.learningProfile.update({ where: { userId }, data: { updatedAt: new Date() } });

    return { outcome: existing ? 'replaced' : 'ingested', rejectedTags };
  }

  /** Re-folds each competency from the owner's full ordered log, and materializes the result (or drops it). */
  private async refold(tx: Prisma.TransactionClient, userId: string, competencies: ReadonlySet<string>): Promise<void> {
    for (const competency of competencies) {
      const rows = await tx.profileMeasurement.findMany({
        where: { userId, competency },
        select: {
          id: true,
          weight: true,
          value: true,
          accuracy: true,
          prosody: true,
          measuredAt: true,
          createdAt: true,
          scoreAfter: true,
          accuracyAfter: true,
          prosodyAfter: true,
        },
      });
      const folded = foldCompetency(rows.map((row) => ({ ...row, weight: storedWeight(row.weight) })));
      if (!folded) {
        await tx.profileCompetency.deleteMany({ where: { userId, competency } });
        continue;
      }

      const stored = new Map(rows.map((row) => [row.id, row]));
      for (const row of folded.rows) {
        const before = stored.get(row.id)!;
        if (
          moved(before.scoreAfter, row.scoreAfter) ||
          moved(before.accuracyAfter, row.accuracyAfter) ||
          moved(before.prosodyAfter, row.prosodyAfter)
        ) {
          await tx.profileMeasurement.update({
            where: { id: row.id },
            data: { scoreAfter: row.scoreAfter, accuracyAfter: row.accuracyAfter, prosodyAfter: row.prosodyAfter },
          });
        }
      }

      const values = {
        score: folded.score,
        previousScore: folded.previousScore,
        measurementCount: folded.measurementCount,
        trend: folded.trend,
        accuracy: folded.accuracy,
        prosody: folded.prosody,
        prosodyCount: folded.prosodyCount,
        lastMeasuredAt: folded.lastMeasuredAt,
        updatedAt: new Date(),
      };
      await tx.profileCompetency.upsert({
        where: { userId_competency: { userId, competency } },
        create: { userId, competency, ...values },
        update: values,
      });
    }
  }

  /** Recomputes each ledger record from its occurrences and encounters, and materializes it (or drops it). */
  private async reaggregate(tx: Prisma.TransactionClient, userId: string, tagSet: ReadonlySet<string>): Promise<void> {
    if (tagSet.size === 0) {
      return;
    }
    const tags = [...tagSet];
    const [occurrences, encounters, entries] = await Promise.all([
      tx.errorLedgerOccurrence.findMany({
        where: { userId, tag: { in: tags } },
        select: { tag: true, occurredAt: true, activityId: true },
      }),
      tx.errorLedgerEncounter.findMany({ where: { userId, tag: { in: tags } }, select: { tag: true, occurredAt: true } }),
      tx.errorLedgerEntry.findMany({ where: { userId, tag: { in: tags } }, select: { tag: true, label: true } }),
    ]);
    const occurrencesByTag = groupByTag<RuleOccurrence & { tag: string }>(occurrences);
    const encountersByTag = groupByTag<RuleEncounter & { tag: string }>(encounters);
    const storedLabels = new Map(entries.map((entry) => [entry.tag, entry.label]));
    const taxonomyVersion = this.taxonomy.current().version;

    for (const tag of tags) {
      const aggregate = aggregateEntry(occurrencesByTag.get(tag) ?? [], encountersByTag.get(tag) ?? []);
      if (!aggregate) {
        await tx.errorLedgerEntry.deleteMany({ where: { userId, tag } });
        continue;
      }
      // A retired tag keeps the label it had when it was last in force.
      const label = this.taxonomy.has(tag) ? this.taxonomy.labelOf(tag) : (storedLabels.get(tag) ?? tag);
      const values = {
        label,
        occurrenceCount: aggregate.occurrenceCount,
        firstSeenAt: aggregate.firstSeenAt,
        lastSeenAt: aggregate.lastSeenAt,
        state: aggregate.state,
        taxonomyVersion,
        updatedAt: new Date(),
      };
      await tx.errorLedgerEntry.upsert({
        where: { userId_tag: { userId, tag } },
        create: { userId, tag, family: tag.slice(0, tag.indexOf(':')), ...values },
        update: values,
      });
    }
  }
}
