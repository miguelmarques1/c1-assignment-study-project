import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { RecordingFinalizerService } from './recording-finalizer.service';
import { RecordingStateService } from './recording-state.service';
import { RECORDING_FINALIZATION_INTERVAL_MS, RECORDING_LEASE_MS } from './recording.constants';

/**
 * Drives recording finalization for every ended lesson whose recording is
 * not yet finalized. Follows `LessonLifecycleJob`'s own pattern: one lesson
 * failing must never stop the sweep, and state lives in Postgres (the
 * lease), so an API restart mid-finalization loses no progress.
 */
@Injectable()
export class RecordingFinalizationJob {
  private readonly logger = new Logger(RecordingFinalizationJob.name);

  constructor(
    private readonly state: RecordingStateService,
    private readonly finalizer: RecordingFinalizerService,
  ) {}

  @Interval('recording-finalization-sweep', RECORDING_FINALIZATION_INTERVAL_MS)
  async run(): Promise<{ claimed: number }> {
    const now = new Date();
    const lessons = await this.state.claimForFinalization(now, RECORDING_LEASE_MS);

    for (const lesson of lessons) {
      try {
        await this.finalizer.finalize(lesson, now);
      } catch (error) {
        this.logger.warn(
          `Finalization failed for lesson ${lesson.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
        await this.state.releaseLease(lesson.id).catch(() => undefined);
      }
    }

    return { claimed: lessons.length };
  }
}
