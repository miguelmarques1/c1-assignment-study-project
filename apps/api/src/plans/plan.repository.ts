import { Injectable } from '@nestjs/common';
import type { StudyPlanActivity, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { PLAN_LOCK_NAMESPACE } from './plan.constants';

export type TxClient = Prisma.TransactionClient;

export interface NewPlanRow {
  userId: string;
  lessonId: string;
  origin: string;
  status: 'active' | 'archived';
  precedenceAt: Date;
  composition: 'model' | 'deterministic';
  deterministicReason: string | null;
  generalMaterial: boolean;
  notes: Array<{ code: string; text: string }>;
  focusTags: string[];
  promptId: string | null;
  promptVersion: string | null;
  model: string | null;
  modelSelectionStats: unknown;
  generationRunId: string | null;
  rulesVersion: string;
  rulesFingerprint: string;
  taxonomyVersion: string;
  supersededByPlanId: string | null;
  createdAt: Date;
  activatedAt: Date | null;
  archivedAt: Date | null;
}

export interface NewActivityRow {
  userId: string;
  day: number;
  position: number;
  kind: string;
  contentItemId: string | null;
  title: string;
  targetTags: string[];
  isReview: boolean;
  estimatedMinutes: number;
  rationale: string;
  rationaleSource: 'model' | 'template';
  placement: 'model' | 'guardrail' | 'carry_over' | 'task';
  carriedFromActivityId: string | null;
  state: 'pending' | 'in_progress';
  startedAt: Date | null;
}

/**
 * The one writer and reader of plan rows. Callers (`PlanActivationService`,
 * `PlanReadService`, `PlanHistoryReader`) stay free of Prisma's shape and
 * of the advisory lock's SQL.
 */
@Injectable()
export class PlanRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Locks this user's plan writes for the rest of the current transaction (spec A19). */
  async lock(tx: TxClient, userId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${PLAN_LOCK_NAMESPACE + userId}, 0))`;
  }

  async findByLessonOrigin(client: TxClient | PrismaService, userId: string, lessonId: string, origin: string) {
    return client.studyPlan.findUnique({ where: { userId_lessonId_origin: { userId, lessonId, origin } } });
  }

  async findActive(client: TxClient | PrismaService, userId: string) {
    return client.studyPlan.findFirst({
      where: { userId, status: 'active' },
      include: { activities: { orderBy: [{ day: 'asc' }, { position: 'asc' }] } },
    });
  }

  async allPrecedence(client: TxClient | PrismaService, userId: string): Promise<Array<{ precedenceAt: Date; origin: string }>> {
    return client.studyPlan.findMany({ where: { userId }, select: { precedenceAt: true, origin: true } });
  }

  async archive(tx: TxClient, planId: string, at: Date): Promise<void> {
    await tx.studyPlan.update({ where: { id: planId }, data: { status: 'archived', archivedAt: at } });
  }

  async insertPlan(tx: TxClient, row: NewPlanRow): Promise<string> {
    const created = await tx.studyPlan.create({
      data: {
        userId: row.userId,
        lessonId: row.lessonId,
        origin: row.origin,
        status: row.status,
        precedenceAt: row.precedenceAt,
        composition: row.composition,
        deterministicReason: row.deterministicReason,
        generalMaterial: row.generalMaterial,
        notes: row.notes as unknown as Prisma.InputJsonValue,
        focusTags: row.focusTags,
        promptId: row.promptId,
        promptVersion: row.promptVersion,
        model: row.model,
        modelSelectionStats: (row.modelSelectionStats ?? undefined) as Prisma.InputJsonValue | undefined,
        generationRunId: row.generationRunId,
        rulesVersion: row.rulesVersion,
        rulesFingerprint: row.rulesFingerprint,
        taxonomyVersion: row.taxonomyVersion,
        supersededByPlanId: row.supersededByPlanId,
        createdAt: row.createdAt,
        activatedAt: row.activatedAt,
        archivedAt: row.archivedAt,
      },
      select: { id: true },
    });
    return created.id;
  }

  async insertActivities(tx: TxClient, planId: string, rows: readonly NewActivityRow[]): Promise<void> {
    if (rows.length === 0) {
      return;
    }
    await tx.studyPlanActivity.createMany({
      data: rows.map((row) => ({
        planId,
        userId: row.userId,
        day: row.day,
        position: row.position,
        kind: row.kind,
        contentItemId: row.contentItemId,
        title: row.title,
        targetTags: row.targetTags,
        isReview: row.isReview,
        estimatedMinutes: row.estimatedMinutes,
        rationale: row.rationale,
        rationaleSource: row.rationaleSource,
        placement: row.placement,
        carriedFromActivityId: row.carriedFromActivityId,
        state: row.state,
        startedAt: row.startedAt,
      })),
    });
  }

  async planWithActivities(client: TxClient | PrismaService, planId: string) {
    return client.studyPlan.findUnique({
      where: { id: planId },
      include: { activities: { orderBy: [{ day: 'asc' }, { position: 'asc' }] } },
    });
  }

  async planForOwner(userId: string, planId: string) {
    const plan = await this.prisma.studyPlan.findUnique({
      where: { id: planId },
      include: { activities: { orderBy: [{ day: 'asc' }, { position: 'asc' }] } },
    });
    return plan && plan.userId === userId ? plan : null;
  }

  async historyForOwner(userId: string, limit = 100) {
    return this.prisma.studyPlan.findMany({
      where: { userId },
      include: { activities: { select: activitySummarySelect } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async activityById(client: TxClient | PrismaService, activityId: string): Promise<StudyPlanActivity | null> {
    return client.studyPlanActivity.findUnique({ where: { id: activityId } });
  }

  /** The newest carried copy of a chain of activities (an activity may itself have been carried forward again). */
  async newestInChain(client: TxClient | PrismaService, activityId: string): Promise<StudyPlanActivity> {
    let current = await client.studyPlanActivity.findUniqueOrThrow({ where: { id: activityId } });
    // `ux_plan_activities_carried_from` guarantees at most one forward link per activity.
    for (;;) {
      const next = await client.studyPlanActivity.findFirst({ where: { carriedFromActivityId: current.id } });
      if (!next) {
        return current;
      }
      current = next;
    }
  }
}

const activitySummarySelect = { state: true, isReview: true, difficultyRating: true, notUseful: true } as const;
