import { Injectable, Logger } from '@nestjs/common';
import type {
  ClassroomEndResult,
  ClassroomSession,
  ClassroomToken,
  LessonStatus,
} from '@english-quest/shared';

import { AppError } from '../common/app-error';
import { env } from '../config/env';
import { ScenarioOrchestratorService } from '../scenario/scenario-orchestrator.service';
import { CLASSROOM_ROOM_NAME } from './classroom.constants';
import { LessonService } from './lesson.service';
import { LiveKitService } from './livekit.service';

const TERMINAL_STATUSES = ['ended', 'ended_unexpectedly', 'abandoned'];

/** Resolves or creates the open lesson, enforces the cap, issues tokens, ends lessons on request. */
@Injectable()
export class ClassroomService {
  private readonly logger = new Logger(ClassroomService.name);

  constructor(
    private readonly lessons: LessonService,
    private readonly liveKit: LiveKitService,
    private readonly scenario: ScenarioOrchestratorService,
  ) {}

  async requestToken(user: { id: string; displayName: string }): Promise<ClassroomToken> {
    const config = env();
    const room = CLASSROOM_ROOM_NAME;

    let lesson = await this.lessons.findOpenLesson(room);
    let createdNewLesson = false;
    if (!lesson) {
      const opened = await this.lessons.tryOpenLesson(room, user.id, config.LESSON_MAX_PARTICIPANTS);
      lesson = opened.lesson;
      createdNewLesson = opened.created;
    }

    let liveParticipants;
    try {
      liveParticipants = await this.liveKit.listParticipants(room);
    } catch (error) {
      // Nothing this request created is left behind when LiveKit cannot be reached.
      if (createdNewLesson) {
        await this.lessons.discardLesson(lesson.id);
      }
      throw error;
    }

    const alreadyPresent = liveParticipants.some((p) => p.identity === user.id);
    if (!alreadyPresent && liveParticipants.length >= lesson.maxParticipants) {
      throw AppError.classroomFull(lesson.maxParticipants);
    }

    // Idempotent for an existing room; gives LiveKit its own cap enforcement.
    await this.liveKit.createRoom(room, lesson.maxParticipants);
    await this.lessons.registerParticipant(lesson.id, user.id, user.id);

    // Fire-and-forget, per the spec: the token response must not wait on a
    // model call. A failure here must never break token issuance — the
    // lesson can always proceed without a scenario.
    this.scenario.onParticipantRegistered(lesson, user.id).catch((error: unknown) => {
      this.logger.error(`Scenario orchestration failed for lesson ${lesson.id}`, error);
    });

    const { token, expiresAt } = await this.liveKit.issueAccessToken({
      identity: user.id,
      name: user.displayName,
      room,
    });

    return {
      lessonId: lesson.id,
      roomName: room,
      url: config.LIVEKIT_WS_URL,
      token,
      identity: user.id,
      expiresAt: expiresAt.toISOString(),
      maxParticipants: lesson.maxParticipants,
      status: lesson.status as LessonStatus,
    };
  }

  session(): Promise<ClassroomSession> {
    return this.lessons.projectSession(CLASSROOM_ROOM_NAME);
  }

  async endLesson(lessonId: string, callerId: string): Promise<ClassroomEndResult> {
    const isParticipant = await this.lessons.isParticipant(lessonId, callerId);
    if (!isParticipant) {
      throw AppError.notAParticipant();
    }

    const lesson = await this.lessons.findOpenLesson(CLASSROOM_ROOM_NAME);
    if (!lesson || lesson.id !== lessonId || TERMINAL_STATUSES.includes(lesson.status)) {
      throw AppError.lessonNotActive();
    }

    const finalized = await this.lessons.finalizeLesson(lessonId, 'ended_by_participant', {
      endedBy: callerId,
      endedAt: new Date(),
    });

    await this.liveKit.deleteRoom(lesson.room);

    if (!finalized.endedAt) {
      // Unreachable: finalizeLesson only reaches this branch by just having set it.
      throw new Error('finalizeLesson did not set endedAt.');
    }

    return {
      lessonId: finalized.id,
      status: finalized.status as LessonStatus,
      endedAt: finalized.endedAt.toISOString(),
      durationSeconds: finalized.durationSeconds,
    };
  }
}
