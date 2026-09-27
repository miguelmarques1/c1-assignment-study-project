import { Injectable } from '@nestjs/common';
import type { DifficultyRating, PlanActivityKind, PlanHistoryItem, PlanRatingCounts, StudyPlanStatus } from '@english-quest/shared';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ErrorTaxonomyService } from '../taxonomy/error-taxonomy.service';
import { formatSummaryLine } from './composition/summary-line';
import { PlanRepository } from './plan.repository';

const SESSIONS_PER_PLAN = 7;

type PlanWithActivitySummaries = Prisma.StudyPlanGetPayload<{
  include: { activities: { select: { state: true; isReview: true; difficultyRating: true; notUseful: true } } };
}>;

export interface CompletedActivityRecord {
  activityId: string;
  planId: string;
  kind: PlanActivityKind;
  completedAt: Date;
  rating: DifficultyRating | null;
  notUseful: boolean;
}

function ratingCountsOf(activities: readonly { state: string; difficultyRating: string | null; notUseful: boolean }[]): PlanRatingCounts {
  const completed = activities.filter((activity) => activity.state === 'completed');
  return {
    tooEasy: completed.filter((activity) => activity.difficultyRating === 'too_easy').length,
    justRight: completed.filter((activity) => activity.difficultyRating === 'just_right').length,
    tooHard: completed.filter((activity) => activity.difficultyRating === 'too_hard').length,
    notUseful: completed.filter((activity) => activity.notUseful).length,
  };
}

/**
 * Completion statistics behind both `GET /plans` and F20's dashboard (spec
 * §5 "one reader behind both" — the cross-feature criterion this proves).
 */
@Injectable()
export class PlanHistoryReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: PlanRepository,
    private readonly taxonomy: ErrorTaxonomyService,
  ) {}

  async completionHistoryFor(userId: string): Promise<PlanHistoryItem[]> {
    const plans = await this.repository.historyForOwner(userId);
    return plans.map((plan) => this.toHistoryItem(plan));
  }

  async completedActivities(userId: string, since: Date): Promise<CompletedActivityRecord[]> {
    const rows = await this.prisma.studyPlanActivity.findMany({
      where: { userId, state: 'completed', completedAt: { gte: since } },
      select: { id: true, planId: true, kind: true, completedAt: true, difficultyRating: true, notUseful: true },
    });
    return rows.map((row) => ({
      activityId: row.id,
      planId: row.planId,
      kind: row.kind as PlanActivityKind,
      completedAt: row.completedAt!,
      rating: row.difficultyRating as DifficultyRating | null,
      notUseful: row.notUseful,
    }));
  }

  private toHistoryItem(plan: PlanWithActivitySummaries): PlanHistoryItem {
    const activityCount = plan.activities.length;
    const completedCount = plan.activities.filter((activity) => activity.state === 'completed').length;
    const skippedCount = plan.activities.filter((activity) => activity.state === 'skipped').length;
    const doneCount = completedCount + skippedCount;
    const labelOf = (tag: string): string => this.taxonomy.labelOf(tag);

    return {
      id: plan.id,
      status: plan.status as StudyPlanStatus,
      origin: plan.origin as PlanHistoryItem['origin'],
      lessonId: plan.lessonId,
      lessonDate: plan.precedenceAt.toISOString(),
      createdAt: plan.createdAt.toISOString(),
      activatedAt: plan.activatedAt?.toISOString() ?? null,
      archivedAt: plan.archivedAt?.toISOString() ?? null,
      summaryLine: formatSummaryLine(SESSIONS_PER_PLAN, activityCount, plan.focusTags.map(labelOf), plan.generalMaterial),
      activityCount,
      completedCount,
      skippedCount,
      completionPercent: activityCount > 0 ? Math.floor((100 * doneCount) / activityCount) : 0,
      ratings: ratingCountsOf(plan.activities),
    };
  }
}
