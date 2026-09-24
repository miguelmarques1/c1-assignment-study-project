import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma, type LessonRecordingSegment } from '@prisma/client';
import type { LiveParticipantRecordingStatus, LiveRecording, LiveRecordingStatus } from '@english-quest/shared';

import { PrismaService } from '../prisma/prisma.service';
import { segmentObjectKey } from './recording.constants';

const OPEN_SEGMENT_STATUSES = ['requested', 'starting', 'active', 'ending'] as const;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Owns every write to recording state — segments, the lesson's and each
 * participant's recording columns — and the caller-scoped live projection
 * `GET /classroom/session` reads. Resolves lessons by room directly through
 * Prisma rather than importing `ClassroomModule`'s `LessonService`, the same
 * avoid-a-circular-import choice F06's `ScenarioService` already made:
 * `ClassroomModule` imports `RecordingModule` for the webhook wiring, so the
 * reverse import is not available here.
 */
@Injectable()
export class RecordingStateService {
  constructor(private readonly prisma: PrismaService) {}

  /** The live lesson for a room, or null. Recording only ever starts a new segment while a lesson is `live`. */
  findLiveLesson(room: string) {
    return this.prisma.lesson.findFirst({ where: { room, status: 'live' } });
  }

  /** By id, whatever its current status — `onEgressEnded` needs to know if the lesson is *still* live. */
  getLesson(lessonId: string) {
    return this.prisma.lesson.findUnique({ where: { id: lessonId } });
  }

  // ---------------------------------------------------------------------
  // Lesson-wide recording status
  // ---------------------------------------------------------------------

  /** `idle` -> `starting`, once, when the lesson itself starts. */
  async markLessonStarting(lessonId: string): Promise<void> {
    await this.prisma.lesson.updateMany({
      where: { id: lessonId, recordingStatus: 'idle' },
      data: { recordingStatus: 'starting' },
    });
  }

  /**
   * `recordingStartedAt` is set once, from whichever egress reports active
   * first — true regardless of whether the lesson later becomes
   * `not_recording` because of a *different* track's failure; some audio
   * still genuinely exists from this moment. The status itself only ever
   * advances from `starting`: a failure elsewhere already moved it to the
   * sticky `not_recording`, which this must never undo.
   */
  async markLessonRecording(lessonId: string, at: Date): Promise<void> {
    await this.prisma.lesson.updateMany({
      where: { id: lessonId, recordingStartedAt: null },
      data: { recordingStartedAt: at },
    });
    await this.prisma.lesson.updateMany({
      where: { id: lessonId, recordingStatus: 'starting' },
      data: { recordingStatus: 'recording' },
    });
  }

  /** Sticky: once a lesson stops recording cleanly, nothing moves it back. */
  async markLessonNotRecording(lessonId: string): Promise<void> {
    await this.prisma.lesson.updateMany({
      where: { id: lessonId, recordingStatus: { in: ['idle', 'starting', 'recording'] } },
      data: { recordingStatus: 'not_recording' },
    });
  }

  // ---------------------------------------------------------------------
  // Per-participant recording status
  // ---------------------------------------------------------------------

  async markParticipantRecording(lessonId: string, userId: string): Promise<void> {
    await this.prisma.lessonParticipant.updateMany({
      where: { lessonId, userId, recordingStatus: { in: ['not_started', 'recording'] } },
      data: { recordingStatus: 'recording' },
    });
  }

  async markParticipantFailedToStart(lessonId: string, userId: string): Promise<void> {
    await this.prisma.lessonParticipant.updateMany({
      where: { lessonId, userId, recordingStatus: 'not_started' },
      data: { recordingStatus: 'failed_to_start' },
    });
  }

  async markParticipantStopped(lessonId: string, userId: string): Promise<void> {
    await this.prisma.lessonParticipant.updateMany({
      where: { lessonId, userId, recordingStatus: 'recording' },
      data: { recordingStatus: 'stopped' },
    });
  }

  // ---------------------------------------------------------------------
  // Segments
  // ---------------------------------------------------------------------

  /** Every segment currently open (any non-terminal status) for a track — at most one, by the DB's own partial unique index. */
  findOpenSegmentForTrack(trackSid: string): Promise<LessonRecordingSegment | null> {
    return this.prisma.lessonRecordingSegment.findFirst({
      where: { trackSid, status: { in: [...OPEN_SEGMENT_STATUSES] } },
    });
  }

  findSegmentByEgressId(egressId: string): Promise<LessonRecordingSegment | null> {
    return this.prisma.lessonRecordingSegment.findUnique({ where: { egressId } });
  }

  /** Every row ever created for a track, including failed starts and restarts — what bounds the single restart. */
  countSegmentsForTrack(trackSid: string): Promise<number> {
    return this.prisma.lessonRecordingSegment.count({ where: { trackSid } });
  }

  /**
   * Creates a new segment row, its id generated client-side so the object
   * key (which embeds it) is known before the egress request is made.
   * A unique-violation on `ux_segments_open_track` means a race with another
   * handler for the same track (the lesson-start read and a `track_published`
   * webhook can overlap) — the loser reuses the winner's row instead of
   * creating a second egress for one track.
   */
  async createSegment(
    lessonId: string,
    userId: string,
    trackSid: string,
  ): Promise<LessonRecordingSegment> {
    const id = randomUUID();
    const objectKey = segmentObjectKey(lessonId, userId, id);
    try {
      return await this.prisma.lessonRecordingSegment.create({
        data: { id, lessonId, userId, trackSid, objectKey, status: 'requested', attempt: 1 },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await this.findOpenSegmentForTrack(trackSid);
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  /** The egress accepted the request. */
  async markSegmentStarting(segmentId: string, egressId: string, attempt: number): Promise<void> {
    await this.prisma.lessonRecordingSegment.update({
      where: { id: segmentId },
      data: { status: 'starting', egressId, attempt },
    });
  }

  /** Every start attempt for this row failed — the row stays terminal, freeing the track for a fresh row later. */
  async markSegmentFailedToStart(segmentId: string, attempt: number, error: string): Promise<void> {
    await this.prisma.lessonRecordingSegment.update({
      where: { id: segmentId },
      data: { status: 'failed', attempt, error: error.slice(0, 500) },
    });
  }

  /**
   * The egress reported `EGRESS_ACTIVE`. Idempotent: a replayed or
   * out-of-order `egress_updated` must not overwrite an already-active
   * segment's `fileStartedAt` with a later event's timestamp.
   */
  async markSegmentActive(egressId: string, fileStartedAt: Date): Promise<LessonRecordingSegment | null> {
    const segment = await this.findSegmentByEgressId(egressId);
    if (!segment || segment.status === 'active' || segment.status === 'complete' || segment.status === 'failed') {
      return segment;
    }
    return this.prisma.lessonRecordingSegment.update({
      where: { egressId },
      data: { status: 'active', fileStartedAt },
    });
  }

  /**
   * The egress reported a terminal status. `unexpected` marks an end that
   * happened while the lesson was still live and the track still published —
   * the trigger for the single restart.
   */
  async markSegmentEnded(
    egressId: string,
    params: {
      outcome: 'complete' | 'failed';
      unexpected: boolean;
      fileStartedAt: Date | null;
      fileEndedAt: Date;
      durationMs: number | null;
      sizeBytes: number | null;
      error?: string;
    },
  ): Promise<LessonRecordingSegment | null> {
    const segment = await this.findSegmentByEgressId(egressId);
    if (!segment || segment.status === 'complete' || segment.status === 'failed') {
      // Idempotent against a replayed terminal event.
      return segment;
    }
    return this.prisma.lessonRecordingSegment.update({
      where: { egressId },
      data: {
        status: params.outcome,
        unexpected: params.unexpected,
        fileStartedAt: params.fileStartedAt ?? segment.fileStartedAt,
        fileEndedAt: params.fileEndedAt,
        durationMs: params.durationMs,
        sizeBytes: params.sizeBytes ? BigInt(params.sizeBytes) : null,
        error: params.error?.slice(0, 500),
      },
    });
  }

  // ---------------------------------------------------------------------
  // Live projection for `GET /classroom/session`
  // ---------------------------------------------------------------------

  async projectLiveRecording(lessonId: string, userId: string): Promise<LiveRecording> {
    const [lesson, participant, segments] = await Promise.all([
      this.prisma.lesson.findUniqueOrThrow({
        where: { id: lessonId },
        select: { recordingStatus: true, recordingStartedAt: true },
      }),
      this.prisma.lessonParticipant.findUnique({
        where: { lessonId_userId: { lessonId, userId } },
        select: { recordingStatus: true },
      }),
      this.prisma.lessonRecordingSegment.findMany({
        where: { lessonId, userId },
        select: { status: true, fileStartedAt: true, fileEndedAt: true },
      }),
    ]);

    const now = Date.now();
    const capturedMs = segments.reduce((sum, segment) => {
      if (!segment.fileStartedAt) {
        return sum;
      }
      if (segment.status === 'active') {
        return sum + Math.max(now - segment.fileStartedAt.getTime(), 0);
      }
      if (segment.status === 'complete' && segment.fileEndedAt) {
        return sum + Math.max(segment.fileEndedAt.getTime() - segment.fileStartedAt.getTime(), 0);
      }
      return sum;
    }, 0);

    return {
      status: lesson.recordingStatus as LiveRecordingStatus,
      since: lesson.recordingStartedAt?.toISOString() ?? null,
      mine: {
        status: (participant?.recordingStatus ?? 'not_started') as LiveParticipantRecordingStatus,
        capturedSeconds: Math.round(capturedMs / 1000),
      },
    };
  }
}
