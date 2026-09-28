import { Injectable } from '@nestjs/common';
import type { DifficultyRating, PlanActivityKind, PlanActivityState, StudyPlanStatus } from '@english-quest/shared';
import type { StudyPlanActivity } from '@prisma/client';

import { AppError } from '../common/app-error';
import { PrismaService } from '../prisma/prisma.service';
import { PlanRepository, type TxClient } from './plan.repository';

export interface ResolvedActivity {
  activityId: string;
  /** Every id in the carry-over chain, oldest first — `activityId` is `lineage[lineage.length - 1]`. */
  lineage: string[];
  planId: string;
  planStatus: StudyPlanStatus;
  kind: PlanActivityKind;
  contentItemId: string | null;
  targetTags: string[];
  estimatedMinutes: number;
  state: PlanActivityState;
  day: number;
  position: number;
}

export interface CompletionOutcome {
  completionKey: string;
  completedAt: Date;
  scoreCorrect?: number;
  scoreTotal?: number;
  timeSpentSeconds?: number;
}

export interface CompletionResult {
  state: PlanActivityState;
  sessionCompleted: boolean;
  planCompletionPercent: number;
}

const DONE_STATES = new Set<PlanActivityState>(['completed', 'skipped']);

/**
 * The internal contract F16, F17 and F18 call inside their own submission
 * transactions (spec §5 `PlanActivityStateService`). Every method resolves
 * the caller's activity id forward through its carry-over chain first, so
 * a runner that opened an old id still finishes on the plan the user has
 * now. `PLAN003` for an unknown or foreign id; `PLAN004` when the
 * resolved plan was replaced and this activity was not carried forward.
 */
@Injectable()
export class PlanActivityStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: PlanRepository,
  ) {}

  async resolveForOwner(userId: string, activityId: string, client: TxClient | PrismaService = this.prisma): Promise<ResolvedActivity> {
    const first = await this.repository.activityById(client, activityId);
    if (!first || first.userId !== userId) {
      throw AppError.planActivityNotFound(activityId);
    }
    let current: StudyPlanActivity = first;
    const lineage = [current.id];
    for (;;) {
      const next: StudyPlanActivity | null = await client.studyPlanActivity.findFirst({ where: { carriedFromActivityId: current.id } });
      if (!next) {
        break;
      }
      current = next;
      lineage.push(current.id);
    }
    const plan = await client.studyPlan.findUniqueOrThrow({ where: { id: current.planId }, select: { status: true } });

    return {
      activityId: current.id,
      lineage,
      planId: current.planId,
      planStatus: plan.status as StudyPlanStatus,
      kind: current.kind as PlanActivityKind,
      contentItemId: current.contentItemId,
      targetTags: current.targetTags,
      estimatedMinutes: current.estimatedMinutes,
      state: current.state as PlanActivityState,
      day: current.day,
      position: current.position,
    };
  }

  async markStarted(userId: string, activityId: string, options: { at: Date }, tx?: TxClient): Promise<PlanActivityState> {
    const client = tx ?? this.prisma;
    const resolved = await this.resolveForOwner(userId, activityId, client);
    if (resolved.state !== 'pending') {
      return resolved.state;
    }
    this.assertNotArchived(resolved);
    await client.studyPlanActivity.update({ where: { id: resolved.activityId }, data: { state: 'in_progress', startedAt: options.at } });
    return 'in_progress';
  }

  async markCompleted(userId: string, activityId: string, outcome: CompletionOutcome, tx?: TxClient): Promise<CompletionResult> {
    const client = tx ?? this.prisma;
    const resolved = await this.resolveForOwner(userId, activityId, client);
    const current = await this.repository.activityById(client, resolved.activityId);
    if (!current) {
      throw AppError.planActivityNotFound(activityId);
    }
    if (current.completionKey !== outcome.completionKey) {
      this.assertNotArchived(resolved);
      if (current.state !== 'skipped') {
        await client.studyPlanActivity.update({
          where: { id: resolved.activityId },
          data: {
            state: 'completed',
            completedAt: outcome.completedAt,
            startedAt: current.startedAt ?? outcome.completedAt,
            completionKey: outcome.completionKey,
            scoreCorrect: outcome.scoreCorrect ?? null,
            scoreTotal: outcome.scoreTotal ?? null,
            timeSpentSeconds: outcome.timeSpentSeconds ?? null,
          },
        });
      }
    }
    return this.progressResult(client, resolved.planId, resolved.day);
  }

  async markSkipped(userId: string, activityId: string, options: { reason: string; at: Date }, tx?: TxClient): Promise<PlanActivityState> {
    const client = tx ?? this.prisma;
    const resolved = await this.resolveForOwner(userId, activityId, client);
    if (DONE_STATES.has(resolved.state)) {
      return resolved.state;
    }
    this.assertNotArchived(resolved);
    await client.studyPlanActivity.update({
      where: { id: resolved.activityId },
      data: { state: 'skipped', skippedAt: options.at, skipReason: options.reason },
    });
    return 'skipped';
  }

  /** Allowed on an archived plan — a rating on last week's completed activity is still useful signal. */
  async recordRating(
    userId: string,
    activityId: string,
    options: { rating: DifficultyRating | null; notUseful: boolean; at?: Date },
    tx?: TxClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const resolved = await this.resolveForOwner(userId, activityId, client);
    if (resolved.state !== 'completed') {
      throw AppError.validationFailed([{ path: 'activityId', message: 'Only a completed activity can be rated.' }]);
    }
    await client.studyPlanActivity.update({
      where: { id: resolved.activityId },
      data: { difficultyRating: options.rating, notUseful: options.notUseful, ratedAt: options.at ?? new Date() },
    });
  }

  private assertNotArchived(resolved: ResolvedActivity): void {
    if (resolved.planStatus === 'archived') {
      throw AppError.planActivityNotInCurrentPlan(resolved.activityId);
    }
  }

  private async progressResult(client: TxClient | PrismaService, planId: string, day: number): Promise<CompletionResult> {
    const activities = await client.studyPlanActivity.findMany({ where: { planId }, select: { day: true, state: true } });
    const total = activities.length;
    const doneCount = activities.filter((activity) => DONE_STATES.has(activity.state as PlanActivityState)).length;
    const planCompletionPercent = total > 0 ? Math.floor((100 * doneCount) / total) : 0;
    const dayActivities = activities.filter((activity) => activity.day === day);
    const sessionCompleted = dayActivities.length > 0 && dayActivities.every((activity) => DONE_STATES.has(activity.state as PlanActivityState));
    return { state: 'completed', sessionCompleted, planCompletionPercent };
  }
}
