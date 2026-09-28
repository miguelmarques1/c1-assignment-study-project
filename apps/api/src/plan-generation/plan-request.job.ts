import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { StudyPlanOrigin } from '@english-quest/shared';
import type { StudyPlanRequest } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { PlanActivationService } from '../plans/plan-activation.service';
import { PlanComposerService } from '../plans/plan-composer.service';
import { PlanSupersessionService } from '../plans/plan-supersession.service';
import {
  PLAN_REQUEST_BATCH,
  PLAN_REQUEST_INTERVAL_MS,
  PLAN_REQUEST_MAX_ATTEMPTS,
  PLAN_REQUEST_RETRY_DELAYS_MS,
  planFailureMessage,
} from '../plans/plan.constants';
import { PlanRequestRepository } from './plan-request.repository';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface PlanRequestTick {
  discovered: number;
  processed: number;
}

/**
 * Builds the two origins that run outside the pipeline stage: a fallback
 * plan for a failed recording (F07's `StudyPlanFallbackPort`), and an
 * interim plan for a participant whose analysis is blocked on a missing
 * or rejected Gemini key (spec A3, A28). Every tick first discovers
 * requests the sweep may have missed (branches recorded before F15
 * shipped, or newly blocked since the last tick), then claims and settles
 * up to `PLAN_REQUEST_BATCH` requests, never two for the same user at once.
 */
@Injectable()
export class PlanRequestJob {
  private readonly logger = new Logger(PlanRequestJob.name);

  constructor(
    private readonly repository: PlanRequestRepository,
    private readonly prisma: PrismaService,
    private readonly supersession: PlanSupersessionService,
    private readonly composer: PlanComposerService,
    private readonly activation: PlanActivationService,
  ) {}

  @Interval('plan-requests', PLAN_REQUEST_INTERVAL_MS)
  async run(now: Date = new Date()): Promise<PlanRequestTick> {
    const discovered = await this.discover();

    let processed = 0;
    const claimedUsers = new Set<string>();
    for (let i = 0; i < PLAN_REQUEST_BATCH; i += 1) {
      const request = await this.repository.claimOne(now, claimedUsers);
      if (!request) {
        break;
      }
      claimedUsers.add(request.userId);
      await this.processOne(request, now);
      processed += 1;
    }
    return { discovered, processed };
  }

  private async discover(): Promise<number> {
    const fallbacks = await this.repository.discoverFallbacks(50);
    for (const { userId, lessonId } of fallbacks) {
      await this.repository.insertIfAbsent(userId, lessonId, 'recording_failed');
    }
    const blocked = await this.repository.discoverBlockedAnalyses(50);
    for (const { userId, lessonId } of blocked) {
      await this.repository.insertIfAbsent(userId, lessonId, 'analysis_blocked');
    }
    return fallbacks.length + blocked.length;
  }

  private async processOne(request: StudyPlanRequest, now: Date): Promise<void> {
    const { id, userId, lessonId } = request;
    const origin = request.origin as StudyPlanOrigin;
    try {
      const supersededReason = await this.supersession.isSuperseded(userId, lessonId, origin, now);
      if (supersededReason) {
        await this.repository.supersede(id, now);
        return;
      }

      if (origin === 'analysis_blocked' && !(await this.stillBlockedOnGemini(userId, lessonId))) {
        // The key was fixed, or the branch moved on; the pipeline's own stage now owns this lesson's plan.
        await this.repository.supersede(id, now);
        return;
      }

      const lesson = await this.prisma.lesson.findUniqueOrThrow({
        where: { id: lessonId },
        select: { startedAt: true, openedAt: true },
      });
      const lessonTime = lesson.startedAt ?? lesson.openedAt;

      const composed = await this.composer.compose({
        userId,
        lessonId,
        origin,
        now,
        onProgress: (done, total) => this.repository.setProgress(id, done, total),
      });

      await this.prisma.$transaction(async (tx) => {
        const result = await this.activation.activate(tx, userId, composed, lessonTime);
        await this.repository.complete(tx, id, result.planId, now);
      });
    } catch (error) {
      await this.handleFailure(request, error, now);
    }
  }

  private async stillBlockedOnGemini(userId: string, lessonId: string): Promise<boolean> {
    const stage = await this.prisma.lessonPipelineStage.findFirst({
      where: {
        stage: 'lesson_analysis',
        status: 'blocked_missing_key',
        blockedProvider: 'gemini',
        branch: { userId, lessonId },
      },
      select: { id: true },
    });
    return stage !== null;
  }

  private async handleFailure(request: StudyPlanRequest, error: unknown, now: Date): Promise<void> {
    this.logger.warn(
      `Plan request ${request.id} (${request.origin}, attempt ${request.attempts}) failed: ${errorMessage(error)}`,
    );
    if (request.attempts >= PLAN_REQUEST_MAX_ATTEMPTS) {
      const hasActivePlan = (await this.prisma.studyPlan.count({ where: { userId: request.userId, status: 'active' } })) > 0;
      await this.repository.fail(request.id, planFailureMessage(hasActivePlan), now);
      return;
    }
    const delay = PLAN_REQUEST_RETRY_DELAYS_MS[request.attempts - 1] ?? PLAN_REQUEST_RETRY_DELAYS_MS[PLAN_REQUEST_RETRY_DELAYS_MS.length - 1]!;
    await this.repository.scheduleRetry(request.id, new Date(now.getTime() + delay));
  }
}
