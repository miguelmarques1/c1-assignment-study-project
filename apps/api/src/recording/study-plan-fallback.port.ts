import { Injectable, Logger } from '@nestjs/common';
import type { RecordingFailureCode } from '@english-quest/shared';

export interface StudyPlanFallbackRequest {
  lessonId: string;
  userId: string;
  failureCode: RecordingFailureCode;
}

/**
 * F15's seam. Called at most once per branch, when a participant's
 * recording failed at the `recording` stage for any reason — so a broken
 * recording never leaves anyone without study activities (PRD, F15
 * Capabilities and Error Handling). F15 composes the actual plan from that
 * participant's existing profile; this default implementation only logs,
 * and `lesson_pipeline_branches.fallback_requested_at` is what F15 drains
 * for branches recorded before it ships.
 */
@Injectable()
export class StudyPlanFallbackPort {
  private readonly logger = new Logger(StudyPlanFallbackPort.name);

  requestFallbackPlan(request: StudyPlanFallbackRequest): void {
    this.logger.log(
      `Fallback study plan requested for lesson ${request.lessonId}, user ${request.userId} ` +
        `(${request.failureCode}) — no consumer yet (F15).`,
    );
  }
}
