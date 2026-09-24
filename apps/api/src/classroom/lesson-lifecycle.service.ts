import { Injectable, Logger } from '@nestjs/common';
import type { WebhookEvent } from 'livekit-server-sdk';

import { RecordingOrchestrator } from '../recording/recording-orchestrator.service';
import { LessonService } from './lesson.service';

/** LiveKit's own event timestamp — never the API's receipt time. */
function eventTime(event: WebhookEvent): Date {
  return new Date(Number(event.createdAt) * 1000);
}

/**
 * Applies LiveKit's join, leave and room-finished events to the lesson and
 * participant rows. Every handler is safe to run twice on the same event:
 * a replayed or late-delivered webhook must never move state backwards.
 */
@Injectable()
export class LessonLifecycleService {
  private readonly logger = new Logger(LessonLifecycleService.name);

  constructor(
    private readonly lessons: LessonService,
    private readonly recording: RecordingOrchestrator,
  ) {}

  async applyParticipantJoined(event: WebhookEvent): Promise<void> {
    const room = event.room?.name;
    const identity = event.participant?.identity;
    if (!room || !identity) {
      return;
    }

    const lesson = await this.lessons.findOpenLesson(room);
    if (!lesson) {
      // A stray or late event for a lesson that is already closed.
      return;
    }

    const at = eventTime(event);
    await this.lessons.markConnected(lesson.id, identity, identity, at);

    if (!lesson.startedAt) {
      const connected = await this.lessons.countConnected(lesson.id);
      if (connected >= 2) {
        // Only the join that actually performs the transition starts
        // recording (F07) — a replayed event must never start it twice.
        const started = await this.lessons.startLesson(lesson.id, at);
        if (started) {
          await this.recording.onLessonStarted(lesson.id).catch((error: unknown) => {
            this.logger.error(`Recording orchestration failed to start for lesson ${lesson.id}`, error);
          });
        }
      }
    }
  }

  async applyParticipantLeft(event: WebhookEvent): Promise<void> {
    const room = event.room?.name;
    const identity = event.participant?.identity;
    if (!room || !identity) {
      return;
    }

    const lesson = await this.lessons.findOpenLesson(room);
    if (!lesson) {
      return;
    }

    const at = eventTime(event);
    await this.lessons.markDisconnected(lesson.id, identity, at);

    const connected = await this.lessons.countConnected(lesson.id);
    if (connected === 0) {
      await this.lessons.markAllDisconnectedSince(lesson.id, at);
    }
  }

  /** A no-op against an already-terminal lesson, via `finalizeLesson`'s own idempotency. */
  async applyRoomFinished(event: WebhookEvent): Promise<void> {
    const room = event.room?.name;
    if (!room) {
      return;
    }

    const lesson = await this.lessons.findOpenLesson(room);
    if (!lesson) {
      return;
    }

    await this.lessons.finalizeLesson(lesson.id, 'all_disconnected', { endedAt: eventTime(event) });
  }
}
