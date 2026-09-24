import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma, type Lesson, type LessonParticipant, type LessonPipelineBranch, type LessonRecordingSegment } from '@prisma/client';
import type {
  LessonRecordingStatus,
  LiveParticipantRecordingStatus,
  LiveRecording,
  LiveRecordingStatus,
} from '@english-quest/shared';

import { PrismaService } from '../prisma/prisma.service';
import type { ParticipantClassification } from './recording-classifier';
import { audioObjectKey, segmentObjectKey } from './recording.constants';

const OPEN_SEGMENT_STATUSES = ['requested', 'starting', 'active', 'ending'] as const;
const NEEDS_FINALIZATION_STATUSES = ['idle', 'starting', 'recording', 'not_recording', 'finalizing'] as const;
const RETRYABLE_FAILURE_CODES = ['recording_missing', 'recording_assembly_failed'] as const;

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

  // ---------------------------------------------------------------------
  // Finalization
  // ---------------------------------------------------------------------

  /**
   * Claims every terminal lesson whose recording is not yet finalized and
   * whose lease is free, one at a time, so a lesson another (or a slower)
   * tick already holds is left alone. `storage_unavailable` is deliberately
   * excluded — only the explicit retry route re-enters it.
   */
  async claimForFinalization(now: Date, leaseMs: number): Promise<Lesson[]> {
    const candidates = await this.prisma.lesson.findMany({
      where: {
        status: { in: ['ended', 'ended_unexpectedly'] },
        recordingStatus: { in: [...NEEDS_FINALIZATION_STATUSES] },
        OR: [{ recordingLeaseUntil: null }, { recordingLeaseUntil: { lt: now } }],
      },
    });

    const claimed: Lesson[] = [];
    for (const lesson of candidates) {
      const leaseUntil = new Date(now.getTime() + leaseMs);
      const finalizingSince = lesson.recordingFinalizingSince ?? now;
      const result = await this.prisma.lesson.updateMany({
        where: {
          id: lesson.id,
          OR: [{ recordingLeaseUntil: null }, { recordingLeaseUntil: { lt: now } }],
        },
        data: {
          recordingStatus: 'finalizing',
          recordingFinalizingSince: finalizingSince,
          recordingLeaseUntil: leaseUntil,
        },
      });
      if (result.count > 0) {
        claimed.push({
          ...lesson,
          recordingStatus: 'finalizing',
          recordingFinalizingSince: finalizingSince,
          recordingLeaseUntil: leaseUntil,
        });
      }
    }
    return claimed;
  }

  /** Releases the lease without changing status, so the next tick retries the same wait (settle or storage). */
  async releaseLease(lessonId: string): Promise<void> {
    await this.prisma.lesson.update({ where: { id: lessonId }, data: { recordingLeaseUntil: null } });
  }

  /** The first storage transport error of a finalization pass — recorded once, so the 2-minute window has a fixed start. */
  async recordStorageFailureStart(lessonId: string, since: Date): Promise<void> {
    await this.prisma.lesson.updateMany({
      where: { id: lessonId, storageUnavailableSince: null },
      data: { storageUnavailableSince: since },
    });
  }

  /** Every segment for the lesson, any participant, any status — the finalizer's settle check reads this. */
  listSegments(lessonId: string): Promise<LessonRecordingSegment[]> {
    return this.prisma.lessonRecordingSegment.findMany({
      where: { lessonId },
      orderBy: { fileStartedAt: 'asc' },
    });
  }

  /** Registered participants who actually connected at least once — the PRD's "who gets a branch" rule. */
  listConnectedParticipants(lessonId: string): Promise<LessonParticipant[]> {
    return this.prisma.lessonParticipant.findMany({
      where: { lessonId, lastConnectedAt: { not: null } },
    });
  }

  /** LiveKit no longer knows about a segment that was never confirmed ended — the 120-second reconciliation path. */
  async reconcileSegment(segmentId: string): Promise<void> {
    await this.prisma.lessonRecordingSegment.updateMany({
      where: { id: segmentId, status: { in: [...OPEN_SEGMENT_STATUSES] } },
      data: { status: 'failed', unexpected: true, error: 'Egress never reported an outcome.' },
    });
  }

  /** Writes a participant's final recording columns, once classification has decided them. */
  async writeParticipantResult(
    lessonId: string,
    userId: string,
    classification: ParticipantClassification,
  ): Promise<void> {
    await this.prisma.lessonParticipant.update({
      where: { lessonId_userId: { lessonId, userId } },
      data: {
        recordingStatus: classification.recordingStatus,
        audioObjectKey: classification.audioBytes !== null ? audioObjectKey(lessonId, userId) : null,
        audioBytes: classification.audioBytes !== null ? BigInt(classification.audioBytes) : null,
        audioDurationMs: classification.audioDurationMs,
        capturedMs: classification.capturedMs,
      },
    });
  }

  /** Records the timeline origin separately, since it comes from the assembler, not the classification. */
  async writeParticipantRecordingStartedAt(lessonId: string, userId: string, at: Date | null): Promise<void> {
    await this.prisma.lessonParticipant.update({
      where: { lessonId_userId: { lessonId, userId } },
      data: { recordingStartedAt: at },
    });
  }

  /** Creates the branch on first classification, or updates it on a retry. Never touches `launched_at`/`fallback_requested_at`. */
  async upsertBranch(
    lessonId: string,
    userId: string,
    classification: ParticipantClassification,
  ): Promise<LessonPipelineBranch> {
    const status = classification.launches ? 'queued' : 'failed';
    return this.prisma.lessonPipelineBranch.upsert({
      where: { lessonId_userId: { lessonId, userId } },
      create: {
        lessonId,
        userId,
        stage: 'recording',
        status,
        failureCode: classification.failureCode,
        failureReason: classification.failureReason,
        attempts: 1,
      },
      update: {
        status,
        failureCode: classification.failureCode,
        failureReason: classification.failureReason,
        attempts: { increment: 1 },
      },
    });
  }

  /** The lesson's branches move to `storage_unavailable`, created if they don't exist yet. */
  async markBranchesStorageUnavailable(lessonId: string, userIds: string[]): Promise<void> {
    for (const userId of userIds) {
      await this.prisma.lessonPipelineBranch.upsert({
        where: { lessonId_userId: { lessonId, userId } },
        create: { lessonId, userId, stage: 'recording', status: 'storage_unavailable' },
        update: { status: 'storage_unavailable' },
      });
    }
  }

  async markBranchLaunched(branchId: string, at: Date): Promise<void> {
    await this.prisma.lessonPipelineBranch.update({ where: { id: branchId }, data: { launchedAt: at } });
  }

  async markBranchFallbackRequested(branchId: string, at: Date): Promise<void> {
    await this.prisma.lessonPipelineBranch.update({ where: { id: branchId }, data: { fallbackRequestedAt: at } });
  }

  /** The lesson reached a final, non-retryable recording outcome. */
  async finalizeLessonRecording(lessonId: string, status: LessonRecordingStatus, at: Date): Promise<void> {
    await this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        recordingStatus: status,
        recordingFinalizedAt: at,
        recordingLeaseUntil: null,
        storageUnavailableSince: null,
      },
    });
  }

  /** The lesson's own storage window has run out — every connected participant's branch moves with it. */
  async markLessonStorageUnavailable(lessonId: string, since: Date): Promise<void> {
    await this.prisma.lesson.updateMany({
      where: { id: lessonId, storageUnavailableSince: null },
      data: { storageUnavailableSince: since },
    });
    await this.prisma.lesson.update({
      where: { id: lessonId },
      data: { recordingStatus: 'storage_unavailable', recordingLeaseUntil: null },
    });
  }

  /**
   * `POST /lessons/:lessonId/recording/retry`: moves every retryable branch
   * back to `verifying`, the lesson back to `finalizing`, and clears the
   * storage window so a recovered store gets its own fresh 2 minutes.
   */
  async retryRecording(lessonId: string, at: Date): Promise<number> {
    const result = await this.prisma.lessonPipelineBranch.updateMany({
      where: {
        lessonId,
        OR: [
          { status: 'storage_unavailable' },
          { status: 'failed', failureCode: { in: [...RETRYABLE_FAILURE_CODES] } },
        ],
      },
      data: { status: 'verifying', failureCode: null, failureReason: null },
    });
    if (result.count > 0) {
      await this.prisma.lesson.update({
        where: { id: lessonId },
        data: {
          recordingStatus: 'finalizing',
          recordingFinalizingSince: at,
          storageUnavailableSince: null,
          recordingLeaseUntil: null,
        },
      });
    }
    return result.count;
  }

  listBranches(lessonId: string): Promise<LessonPipelineBranch[]> {
    return this.prisma.lessonPipelineBranch.findMany({ where: { lessonId } });
  }

  getBranch(lessonId: string, userId: string): Promise<LessonPipelineBranch | null> {
    return this.prisma.lessonPipelineBranch.findUnique({ where: { lessonId_userId: { lessonId, userId } } });
  }
}
