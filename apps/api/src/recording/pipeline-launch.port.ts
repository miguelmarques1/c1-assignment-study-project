import { Injectable } from '@nestjs/common';

import { PipelineService } from '../pipeline/pipeline.service';

export interface PipelineLaunchPayload {
  lessonId: string;
  userId: string;
  audioObjectKey: string;
  recordingStartedAt: Date;
  audioDurationMs: number;
  capturedMs: number;
}

/**
 * The seam between recording and the rest of the pipeline. Called exactly
 * once per branch, when a participant's recording is verified. Since F08 it
 * hands the branch to the pipeline runner, which writes the `transcription`
 * stage row and queues its job. It never throws: the finalizer has already
 * deleted the segment objects by now, so a failure here must not send the
 * lesson back through assembly — the pipeline's drain recovers it instead.
 */
@Injectable()
export class PipelineLaunchPort {
  constructor(private readonly pipeline: PipelineService) {}

  async launch(payload: PipelineLaunchPayload): Promise<void> {
    await this.pipeline.launch({ lessonId: payload.lessonId, userId: payload.userId });
  }
}
