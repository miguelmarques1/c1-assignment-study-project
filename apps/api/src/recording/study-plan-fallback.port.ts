import { Injectable, Logger } from '@nestjs/common';
import type { RecordingFailureCode } from '@english-quest/shared';

import { PlanRequestRepository } from '../plan-generation/plan-request.repository';

export interface StudyPlanFallbackRequest {
  lessonId: string;
  userId: string;
  failureCode: RecordingFailureCode;
}

/**
 * F15's seam. Called at most once per branch, when a participant's
 * recording failed at the `recording` stage for any reason — so a broken
 * recording never leaves anyone without study activities (PRD, F15
 * Capabilities and Error Handling). Inserts a `recording_failed` plan
 * request idempotently; `PlanRequestJob` composes the actual plan from
 * that participant's existing profile. A failure to insert is logged and
 * swallowed rather than thrown — F07's finalization must not fail because
 * F15's queue is briefly unreachable, and the discovery sweep picks up any
 * branch whose `fallback_requested_at` this call still marks.
 */
@Injectable()
export class StudyPlanFallbackPort {
  private readonly logger = new Logger(StudyPlanFallbackPort.name);

  constructor(private readonly requests: PlanRequestRepository) {}

  async requestFallbackPlan(request: StudyPlanFallbackRequest): Promise<void> {
    try {
      await this.requests.insertIfAbsent(request.userId, request.lessonId, 'recording_failed');
      this.logger.log(
        `Fallback study plan requested for lesson ${request.lessonId}, user ${request.userId} (${request.failureCode}).`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Could not record a fallback plan request for lesson ${request.lessonId}, user ${request.userId}: ${message}`,
      );
    }
  }
}
