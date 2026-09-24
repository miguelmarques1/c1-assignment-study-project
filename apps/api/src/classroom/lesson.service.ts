import { Injectable } from '@nestjs/common';
import { Prisma, type Lesson } from '@prisma/client';
import type { ClassroomSession, LessonEndReason, LessonStatus } from '@english-quest/shared';

import { PrismaService } from '../prisma/prisma.service';
import { RecordingStateService } from '../recording/recording-state.service';

const OPEN_STATUSES = ['waiting', 'live'] as const;
const TERMINAL_STATUSES = ['ended', 'ended_unexpectedly', 'abandoned'] as const;

/** `end_reason` decides the terminal `status`, per the spec's state machine. */
const STATUS_BY_END_REASON: Record<LessonEndReason, LessonStatus> = {
  ended_by_participant: 'ended',
  max_duration: 'ended',
  all_disconnected: 'ended_unexpectedly',
  abandoned_before_start: 'abandoned',
};

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Opens a lesson, upserts participants, projects the current session and
 * finalizes a lesson with a reason and a duration. Owns every write to
 * `lessons` and `lesson_participants` — the surface F06 and F07 will read.
 */
@Injectable()
export class LessonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recording: RecordingStateService,
  ) {}

  findOpenLesson(room: string): Promise<Lesson | null> {
    return this.prisma.lesson.findFirst({ where: { room, status: { in: [...OPEN_STATUSES] } } });
  }

  /**
   * Every non-terminal lesson, for the sweeper to evaluate. The partial
   * unique index caps this at one row per room, and the MVP has one room, so
   * this is never more than a handful of rows regardless of how often the
   * sweeper runs.
   */
  findSweepable(): Promise<Lesson[]> {
    return this.prisma.lesson.findMany({ where: { status: { in: [...OPEN_STATUSES] } } });
  }

  /**
   * Inserts a new lesson row. A unique-violation on `ux_lessons_open_room`
   * means two callers raced to open the room at once — the loser re-reads
   * the winner's row instead of failing, so "two people click at once" never
   * surfaces as an error to either of them.
   */
  async tryOpenLesson(
    room: string,
    openedBy: string,
    maxParticipants: number,
  ): Promise<{ lesson: Lesson; created: boolean }> {
    try {
      const lesson = await this.prisma.lesson.create({ data: { room, openedBy, maxParticipants } });
      return { lesson, created: true };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await this.findOpenLesson(room);
        if (existing) {
          return { lesson: existing, created: false };
        }
      }
      throw error;
    }
  }

  /**
   * Compensates a lesson row created by this same request when the LiveKit
   * occupancy check that followed it failed — "no lesson row is committed"
   * on CLASS002. Never called against a lesson this request did not create.
   */
  async discardLesson(lessonId: string): Promise<void> {
    await this.prisma.lesson.delete({ where: { id: lessonId } });
  }

  async isParticipant(lessonId: string, userId: string): Promise<boolean> {
    const row = await this.prisma.lessonParticipant.findUnique({
      where: { lessonId_userId: { lessonId, userId } },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Token issuance (T6): records that this user has a seat, idempotently.
   * `joinedAt` here is a placeholder (token-issuance time) that
   * `markConnected` overwrites with the real connection time on this
   * participant's first `participant_joined` event — a token can be issued
   * and never used, so it is not yet a "connection".
   */
  async registerParticipant(lessonId: string, userId: string, identity: string): Promise<void> {
    await this.prisma.lessonParticipant.upsert({
      where: { lessonId_userId: { lessonId, userId } },
      create: { lessonId, userId, identity, joinedAt: new Date() },
      update: {},
    });
  }

  countConnected(lessonId: string): Promise<number> {
    return this.prisma.lessonParticipant.count({ where: { lessonId, connected: true } });
  }

  /**
   * Applies a `participant_joined` event. `joinedAt` is set from the event's
   * own timestamp only on this participant's first-ever connection — a
   * reconnect updates presence without moving the "late arrival" timestamp
   * F07 reads. Also clears the lesson's `all_disconnected_since`.
   */
  async markConnected(lessonId: string, userId: string, identity: string, at: Date): Promise<void> {
    const existing = await this.prisma.lessonParticipant.findUnique({
      where: { lessonId_userId: { lessonId, userId } },
    });
    const isFirstConnection = !existing?.lastConnectedAt;

    await this.prisma.lessonParticipant.upsert({
      where: { lessonId_userId: { lessonId, userId } },
      create: { lessonId, userId, identity, joinedAt: at, connected: true, lastConnectedAt: at },
      update: {
        identity,
        connected: true,
        lastConnectedAt: at,
        ...(isFirstConnection ? { joinedAt: at } : {}),
      },
    });

    await this.prisma.lesson.update({
      where: { id: lessonId },
      data: { allDisconnectedSince: null },
    });
  }

  async markDisconnected(lessonId: string, userId: string, at: Date): Promise<void> {
    await this.prisma.lessonParticipant.updateMany({
      where: { lessonId, userId },
      data: { connected: false, lastDisconnectedAt: at },
    });
  }

  async markAllDisconnectedSince(lessonId: string, at: Date): Promise<void> {
    await this.prisma.lesson.update({ where: { id: lessonId }, data: { allDisconnectedSince: at } });
  }

  /**
   * Idempotent: a no-op once `started_at` is already set. Returns whether
   * this call is the one that performed the transition — F07 starts
   * recording only on that call, never on a replayed join.
   */
  async startLesson(lessonId: string, startedAt: Date): Promise<boolean> {
    const result = await this.prisma.lesson.updateMany({
      where: { id: lessonId, startedAt: null },
      data: { status: 'live', startedAt },
    });
    return result.count > 0;
  }

  /**
   * Idempotent against an already-terminal lesson — the one authoritative
   * path per lesson wins, and a later event (a replayed webhook, the
   * sweeper racing the explicit end route) must not overwrite its reason.
   */
  async finalizeLesson(
    lessonId: string,
    reason: LessonEndReason,
    opts: { endedBy?: string; endedAt: Date },
  ): Promise<Lesson> {
    const lesson = await this.prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } });
    if ((TERMINAL_STATUSES as readonly string[]).includes(lesson.status)) {
      return lesson;
    }

    const durationSeconds = lesson.startedAt
      ? Math.round((opts.endedAt.getTime() - lesson.startedAt.getTime()) / 1000)
      : null;

    const [finalized] = await this.prisma.$transaction([
      this.prisma.lesson.update({
        where: { id: lessonId },
        data: {
          status: STATUS_BY_END_REASON[reason],
          endedAt: opts.endedAt,
          endReason: reason,
          endedBy: opts.endedBy ?? null,
          durationSeconds,
        },
      }),
      this.prisma.lessonParticipant.updateMany({
        where: { lessonId, leftAt: null },
        data: { connected: false, leftAt: opts.endedAt, lastDisconnectedAt: opts.endedAt },
      }),
    ]);

    return finalized;
  }

  /** `GET /classroom/session` projection: null when nothing is open, scoped to the caller's own recording figures. */
  async projectSession(room: string, callerId: string): Promise<ClassroomSession> {
    const lesson = await this.findOpenLesson(room);
    if (!lesson) {
      return null;
    }

    const rows = await this.prisma.lessonParticipant.findMany({
      where: { lessonId: lesson.id },
      include: { user: { select: { displayName: true } } },
      orderBy: { joinedAt: 'asc' },
    });

    // A seat is claimed by registering for the lesson (a lesson_participants
    // row from token issuance), not only by having actively connected yet —
    // otherwise the caller who just requested their own token would show up
    // "awaiting" themselves until their first participant_joined webhook.
    const registeredIds = rows.map((row) => row.userId);
    const remainingSeats = Math.max(lesson.maxParticipants - registeredIds.length, 0);

    const others = await this.prisma.user.findMany({
      where: { id: { notIn: registeredIds } },
      select: { id: true, displayName: true },
      orderBy: { createdAt: 'asc' },
      take: remainingSeats,
    });

    return {
      lessonId: lesson.id,
      status: lesson.status as LessonStatus,
      openedBy: lesson.openedBy,
      startedAt: lesson.startedAt?.toISOString() ?? null,
      maxParticipants: lesson.maxParticipants,
      participants: rows.map((row) => ({
        userId: row.userId,
        displayName: row.user.displayName,
        connected: row.connected,
        joinedAt: row.joinedAt.toISOString(),
      })),
      awaiting: others.map((user) => ({ userId: user.id, displayName: user.displayName })),
      // F07: the caller's own captured audio, from their own segments only —
      // never another participant's.
      recording: await this.recording.projectLiveRecording(lesson.id, callerId),
    };
  }
}
