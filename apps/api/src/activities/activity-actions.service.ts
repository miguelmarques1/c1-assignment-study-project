import { Injectable } from '@nestjs/common';
import type { ActivityRatingInput, ActivityRatingView, ActivityView } from '@english-quest/shared';

import { PlanActivityStateService } from '../plans/plan-activity-state.service';
import { PlanRepository } from '../plans/plan.repository';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityViewService } from './activity-view.service';
import { isObjectiveKind } from './activity.constants';
import { ObjectiveAttemptRepository } from './objective-attempt.repository';

/**
 * The actions every runner shares, whatever the activity's kind (A17, A18):
 * skipping with a reason, and the difficulty rating. Writing, speaking and
 * pronunciation can call them instead of shipping their own.
 */
@Injectable()
export class ActivityActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planRepository: PlanRepository,
    private readonly state: PlanActivityStateService,
    private readonly attempts: ObjectiveAttemptRepository,
    private readonly views: ActivityViewService,
  ) {}

  /** Skipping a completed or already skipped activity is a no-op. An open objective attempt is abandoned; the ledger is untouched. */
  async skip(userId: string, activityId: string, reason: string, now: Date): Promise<ActivityView> {
    await this.prisma.$transaction(async (tx) => {
      await this.planRepository.lock(tx, userId);
      await this.state.markSkipped(userId, activityId, { reason, at: now }, tx);
      const resolved = await this.state.resolveForOwner(userId, activityId, tx);
      await this.attempts.abandonOpen(tx, resolved.lineage, now);
    });
    return this.views.viewFor(userId, activityId, now);
  }

  /** Allowed on an archived plan. An objective activity's graded attempt gets the same rating beside its prompt stamp. */
  async rate(userId: string, activityId: string, input: ActivityRatingInput, now: Date): Promise<ActivityRatingView> {
    await this.prisma.$transaction(async (tx) => {
      await this.state.recordRating(userId, activityId, { rating: input.rating, notUseful: input.notUseful, at: now }, tx);
      const resolved = await this.state.resolveForOwner(userId, activityId, tx);
      if (isObjectiveKind(resolved.kind)) {
        await this.attempts.setRating(tx, resolved.lineage, input.rating, input.notUseful, now);
      }
    });
    return { rating: input.rating, notUseful: input.notUseful, ratedAt: now.toISOString() };
  }
}
