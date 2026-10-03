import type { PlanActivityKind } from '@english-quest/shared';

import { AppError } from '../common/app-error';
import type { PlanActivityStateService, ResolvedActivity } from '../plans/plan-activity-state.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TxClient } from './writing.repository';

const WRITING_KIND: PlanActivityKind = 'writing';

/** `PLAN003`: an unknown activity, another user's, or one that is not `writing` are indistinguishable (A22). */
export async function resolveWritingActivity(
  plans: PlanActivityStateService,
  userId: string,
  activityId: string,
  client: TxClient | PrismaService,
): Promise<ResolvedActivity> {
  const resolved = await plans.resolveForOwner(userId, activityId, client);
  if (resolved.kind !== WRITING_KIND) {
    throw AppError.planActivityNotFound(activityId);
  }
  return resolved;
}
