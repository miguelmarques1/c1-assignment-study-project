import { Injectable } from '@nestjs/common';
import type { CurrentPlanView } from '@english-quest/shared';

import { AppError } from '../common/app-error';
import { PipelineService } from '../pipeline/pipeline.service';
import { PlanRequestRepository } from '../plan-generation/plan-request.repository';
import { PrismaService } from '../prisma/prisma.service';
import { PlanReadService } from './plan-read.service';

/**
 * Retries exactly the build `GET /plans/current` reports as `failure`
 * (spec §5 "Retry the caller's failed plan build"). A `lesson`-origin
 * failure goes through the pipeline's own retry, which re-queues the
 * failed `plan_generation` stage; a request-origin failure resets that
 * request to `pending` for the job to pick up again.
 */
@Injectable()
export class PlanRetryService {
  constructor(
    private readonly reads: PlanReadService,
    private readonly pipeline: PipelineService,
    private readonly requests: PlanRequestRepository,
    private readonly prisma: PrismaService,
  ) {}

  async retry(userId: string, now: Date = new Date()): Promise<CurrentPlanView> {
    const current = await this.reads.currentFor(userId, now);
    if (!current.failure) {
      throw AppError.planNothingToRetry();
    }

    if (current.failure.origin === 'lesson') {
      await this.pipeline.retry(current.failure.lessonId, userId);
    } else {
      const request = await this.requests.pendingRequestFor(this.prisma, userId, current.failure.lessonId, current.failure.origin);
      if (!request) {
        throw AppError.planNothingToRetry();
      }
      const reset = await this.requests.resetForRetry(userId, request.id);
      if (!reset) {
        throw AppError.planNothingToRetry();
      }
    }

    return this.reads.currentFor(userId, new Date());
  }
}
