import { Injectable, Logger } from '@nestjs/common';

export interface PipelineLaunchPayload {
  lessonId: string;
  userId: string;
  audioObjectKey: string;
  recordingStartedAt: Date;
  audioDurationMs: number;
  capturedMs: number;
}

/**
 * F08's seam. Called exactly once per branch, when a participant's recording
 * is verified and ready for transcription. F07 introduces no job queue of
 * its own — `.env.example` already assigns the job queues to F08 onward —
 * so this default implementation only logs, and the `queued` branch row is
 * what F08 drains at boot for lessons recorded before it ships.
 */
@Injectable()
export class PipelineLaunchPort {
  private readonly logger = new Logger(PipelineLaunchPort.name);

  launch(payload: PipelineLaunchPayload): void {
    this.logger.log(
      `Pipeline launch requested for lesson ${payload.lessonId}, user ${payload.userId} ` +
        `(${payload.audioDurationMs}ms assembled, ${payload.capturedMs}ms captured) — no consumer yet (F08).`,
    );
  }
}
