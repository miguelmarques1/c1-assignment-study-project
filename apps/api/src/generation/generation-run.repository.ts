import { Injectable } from '@nestjs/common';
import type { GeneratedContentType } from '@english-quest/shared';
import { Prisma, type ContentGenerationAttempt, type ContentGenerationRun, type ContentGenerationSlot } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { GateFailure, GateMetrics } from './generation.contract';
import type { AbandonReason, AttemptOutcome } from './generation-error';
import type { PlannedSlot } from './planning/slot-decorations';

/** Why a slot ended without a generated item (the migration's `ck_generation_slots_reason`). */
export type SlotReason = 'gate_failed_twice' | 'generation_failed' | AbandonReason;

export type RunWithSlots = ContentGenerationRun & { slots: ContentGenerationSlot[] };

export interface RunVersions {
  rulesVersion: string;
  rulesFingerprint: string;
  frequencyListVersion: string;
  taxonomyVersion: string;
}

export interface GenerationNote {
  code: 'gemini_key_missing' | 'gemini_quota_exhausted';
  text: string;
}

/** An attempt row as the slot generator needs it back: to count attempts and rebuild the correction notes. */
export interface RecordedAttempt {
  attempt: number;
  outcome: AttemptOutcome;
  failedChecks: string[];
  /** Stored inside the attempt's metrics, so a resumed slot can rebuild its regeneration notes. */
  failures: GateFailure[];
}

export interface AttemptWrite {
  attempt: number;
  promptId: string;
  promptVersion: string;
  outcome: AttemptOutcome;
  failedChecks?: string[];
  /** Attempt metrics carry no item text (spec A23); `failures` rides along for resumption. */
  gateMetrics?: (GateMetrics & { failures?: GateFailure[] }) | null;
  errorDetail?: string | null;
  latencyMs?: number | null;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Persistence for runs, slots and attempts. Every state change is a single
 * statement or a single transaction, so a crash leaves a run another call
 * can resume: pending slots stay pending, a claimed slot is reclaimable once
 * its lease expires, and attempt rows are the count of what was already paid for.
 */
@Injectable()
export class GenerationRunRepository {
  constructor(private readonly prisma: PrismaService) {}

  findRun(userId: string, runKey: string): Promise<RunWithSlots | null> {
    return this.prisma.contentGenerationRun.findUnique({
      where: { userId_runKey: { userId, runKey } },
      include: { slots: { orderBy: { position: 'asc' } } },
    });
  }

  async runById(runId: string): Promise<RunWithSlots> {
    return this.prisma.contentGenerationRun.findUniqueOrThrow({
      where: { id: runId },
      include: { slots: { orderBy: { position: 'asc' } } },
    });
  }

  /**
   * Creates the run and all its slots at once. When another call created the
   * same run first (the unique key), that run is returned instead, so both
   * callers go on to share one run.
   */
  async createRun(input: {
    userId: string;
    runKey: string;
    maxItems: number;
    versions: RunVersions;
    slots: readonly PlannedSlot[];
    abandonReason: AbandonReason | null;
  }): Promise<RunWithSlots> {
    try {
      return await this.prisma.contentGenerationRun.create({
        data: {
          userId: input.userId,
          runKey: input.runKey,
          maxItems: input.maxItems,
          abandonReason: input.abandonReason,
          ...input.versions,
          slots: {
            create: input.slots.map((slot) => ({
              userId: input.userId,
              position: slot.position,
              type: slot.type,
              targetTags: slot.targetTags,
              tagSources: slot.tagSources,
              genre: slot.genre,
              topicDomain: slot.topicDomain,
              exemplarIndex: slot.exemplarIndex,
            })),
          },
        },
        include: { slots: { orderBy: { position: 'asc' } } },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await this.findRun(input.userId, input.runKey);
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  /**
   * Claims the next slot of a run, in plan order: a pending one, or one whose
   * claim is older than the lease (its worker died). One statement with
   * `FOR UPDATE SKIP LOCKED`, so two workers never take the same slot.
   */
  async claimNextSlot(runId: string, now: Date, leaseMs: number): Promise<ContentGenerationSlot | null> {
    const staleBefore = new Date(now.getTime() - leaseMs);
    const claimed = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE content_generation_slots SET status = 'running', claimed_at = ${now}
      WHERE id = (
        SELECT id FROM content_generation_slots
        WHERE run_id = ${runId}::uuid
          AND (status = 'pending' OR (status = 'running' AND claimed_at < ${staleBefore}))
        ORDER BY position
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id`;
    const id = claimed[0]?.id;
    return id ? this.prisma.contentGenerationSlot.findUniqueOrThrow({ where: { id } }) : null;
  }

  async attemptsFor(slotId: string): Promise<RecordedAttempt[]> {
    const rows: ContentGenerationAttempt[] = await this.prisma.contentGenerationAttempt.findMany({
      where: { slotId },
      orderBy: { attempt: 'asc' },
    });
    return rows.map((row) => ({
      attempt: row.attempt,
      outcome: row.outcome as AttemptOutcome,
      failedChecks: row.failedChecks,
      failures: ((row.gateMetrics as { failures?: GateFailure[] } | null)?.failures ?? []) as GateFailure[],
    }));
  }

  /** Records an attempt and bumps the slot's count in one transaction. */
  async recordAttempt(slotId: string, write: AttemptWrite): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.contentGenerationAttempt.create({
        data: {
          slotId,
          attempt: write.attempt,
          promptId: write.promptId,
          promptVersion: write.promptVersion,
          outcome: write.outcome,
          failedChecks: write.failedChecks ?? [],
          // SQL NULL, not a JSON `null`: `ck_generation_attempts_gate` requires metrics to be absent when no gate ran.
          gateMetrics: write.gateMetrics ? (write.gateMetrics as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
          errorDetail: write.errorDetail ?? null,
          latencyMs: write.latencyMs ?? null,
        },
      }),
      this.prisma.contentGenerationSlot.update({ where: { id: slotId }, data: { attemptCount: write.attempt } }),
    ]);
  }

  /** Records the passing attempt and marks the slot generated, together. */
  async recordPass(slotId: string, write: AttemptWrite, contentItemId: string, now: Date): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.contentGenerationAttempt.create({
        data: {
          slotId,
          attempt: write.attempt,
          promptId: write.promptId,
          promptVersion: write.promptVersion,
          outcome: 'passed',
          failedChecks: [],
          gateMetrics: write.gateMetrics as unknown as Prisma.InputJsonValue,
          latencyMs: write.latencyMs ?? null,
        },
      }),
      this.prisma.contentGenerationSlot.update({
        where: { id: slotId },
        data: { attemptCount: write.attempt, status: 'generated', reason: null, contentItemId, completedAt: now },
      }),
    ]);
  }

  async completeSlot(
    slotId: string,
    outcome: { status: 'fallback'; contentItemId: string; reason: SlotReason } | { status: 'dropped'; reason: SlotReason },
    now: Date,
  ): Promise<void> {
    await this.prisma.contentGenerationSlot.update({
      where: { id: slotId },
      data: {
        status: outcome.status,
        reason: outcome.reason,
        contentItemId: outcome.status === 'fallback' ? outcome.contentItemId : null,
        completedAt: now,
      },
    });
  }

  /** Persists the reason a run stopped calling the model, so a resumed run does not call it again. */
  async markAbandoned(runId: string, reason: AbandonReason): Promise<void> {
    await this.prisma.contentGenerationRun.updateMany({
      where: { id: runId, abandonReason: null },
      data: { abandonReason: reason },
    });
  }

  async finishRun(runId: string, notes: readonly GenerationNote[], now: Date): Promise<void> {
    await this.prisma.contentGenerationRun.update({
      where: { id: runId },
      data: { status: 'completed', finishedAt: now, notes: notes as unknown as Prisma.InputJsonValue },
    });
  }

  /** The user's generated readings' genres, most recent first: the no-repeat window and its fallback order. */
  async readingGenreHistory(userId: string, limit = 50): Promise<string[]> {
    const rows = await this.prisma.contentGenerationSlot.findMany({
      where: { userId, type: 'reading', status: 'generated', genre: { not: null } },
      orderBy: [{ completedAt: 'desc' }, { id: 'asc' }],
      take: limit,
      select: { genre: true },
    });
    return rows.flatMap((row) => (row.genre ? [row.genre] : []));
  }

  /** How many slots of each type the user has had, for the exemplar rotation. */
  async slotCountsByType(userId: string): Promise<Partial<Record<GeneratedContentType, number>>> {
    const groups = await this.prisma.contentGenerationSlot.groupBy({ by: ['type'], where: { userId }, _count: { _all: true } });
    return Object.fromEntries(groups.map((group) => [group.type, group._count._all])) as Partial<
      Record<GeneratedContentType, number>
    >;
  }
}
