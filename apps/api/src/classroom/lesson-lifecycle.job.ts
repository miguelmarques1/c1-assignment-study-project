import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { Lesson } from '@prisma/client';

import {
  CLASSROOM_ALL_DISCONNECTED_GRACE_SECONDS,
  CLASSROOM_MAX_DURATION_MINUTES,
  CLASSROOM_SWEEPER_INTERVAL_MS,
} from './classroom.constants';
import { LessonService } from './lesson.service';
import { LiveKitService } from './livekit.service';

/**
 * Auto-end sweeper: closes lessons abandoned before they started, lessons
 * whose participants have all been gone past the grace period, and lessons
 * that reached the maximum duration. Follows the same job pattern as
 * `DailyRevalidationJob` — one lesson failing must not stop the sweep.
 */
@Injectable()
export class LessonLifecycleJob {
  private readonly logger = new Logger(LessonLifecycleJob.name);

  constructor(
    private readonly lessons: LessonService,
    private readonly liveKit: LiveKitService,
  ) {}

  @Interval('classroom-lifecycle-sweep', CLASSROOM_SWEEPER_INTERVAL_MS)
  async run(): Promise<{ checked: number; closed: number }> {
    const lessons = await this.lessons.findSweepable();
    const now = new Date();
    let closed = 0;

    for (const lesson of lessons) {
      try {
        if (await this.sweepOne(lesson, now)) {
          closed += 1;
        }
      } catch (error) {
        this.logger.warn(
          `Sweep failed for lesson ${lesson.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { checked: lessons.length, closed };
  }

  private async sweepOne(lesson: Lesson, now: Date): Promise<boolean> {
    if (lesson.status === 'waiting' && this.pastGrace(lesson.allDisconnectedSince, now)) {
      await this.lessons.finalizeLesson(lesson.id, 'abandoned_before_start', { endedAt: now });
      return true;
    }

    if (lesson.status === 'live' && this.pastGrace(lesson.allDisconnectedSince, now)) {
      await this.lessons.finalizeLesson(lesson.id, 'all_disconnected', { endedAt: now });
      await this.deleteRoomSafely(lesson.room);
      return true;
    }

    if (lesson.status === 'live' && this.pastMaxDuration(lesson.startedAt, now)) {
      await this.lessons.finalizeLesson(lesson.id, 'max_duration', { endedAt: now });
      await this.deleteRoomSafely(lesson.room);
      return true;
    }

    return false;
  }

  private pastGrace(allDisconnectedSince: Date | null, now: Date): boolean {
    if (!allDisconnectedSince) {
      return false;
    }
    return (
      now.getTime() - allDisconnectedSince.getTime() >
      CLASSROOM_ALL_DISCONNECTED_GRACE_SECONDS * 1000
    );
  }

  private pastMaxDuration(startedAt: Date | null, now: Date): boolean {
    if (!startedAt) {
      return false;
    }
    return now.getTime() - startedAt.getTime() > CLASSROOM_MAX_DURATION_MINUTES * 60 * 1000;
  }

  /** The room may already be gone (LiveKit's own empty-room timeout); that must not fail the sweep. */
  private async deleteRoomSafely(room: string): Promise<void> {
    try {
      await this.liveKit.deleteRoom(room);
    } catch (error) {
      this.logger.warn(
        `deleteRoom(${room}) failed during sweep: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
