import { Injectable } from '@nestjs/common';
import type { Lesson } from '@prisma/client';
import type {
  LessonRecordingStatus,
  LessonRecordingView,
  ParticipantRecordingStatus,
  PipelineBranchStage,
  PipelineBranchStatus,
  RecordingFailureCode,
} from '@english-quest/shared';

import { AppError } from '../common/app-error';
import { PrismaService } from '../prisma/prisma.service';
import { RecordingStateService } from './recording-state.service';

const RETRYABLE_FAILURE_CODES = new Set(['recording_missing', 'recording_assembly_failed']);
const TERMINAL_RECORDING_STATUSES = new Set([
  'recorded',
  'recording_partial',
  'recording_failed',
  'too_short',
  'storage_unavailable',
]);

/** Route logic for `GET /lessons/:lessonId/recording` and its retry — builds the caller-scoped view and applies the retry rules. */
@Injectable()
export class RecordingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly state: RecordingStateService,
  ) {}

  async getView(lessonId: string, callerId: string): Promise<LessonRecordingView> {
    const lesson = await this.requireParticipant(lessonId, callerId);
    return this.buildView(lesson, callerId);
  }

  async retry(lessonId: string, callerId: string): Promise<LessonRecordingView> {
    const lesson = await this.requireParticipant(lessonId, callerId);

    if (!TERMINAL_RECORDING_STATUSES.has(lesson.recordingStatus)) {
      throw AppError.recordingNotFinalized();
    }

    const now = new Date();
    const movedCount = await this.state.retryRecording(lessonId, now);
    if (movedCount === 0) {
      throw AppError.recordingNotRetryable(lesson.recordingStatus);
    }

    const updated = await this.prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } });
    return this.buildView(updated, callerId);
  }

  /** Following F05's precedent: an unknown lesson id reads the same as "not a participant" to the caller. */
  private async requireParticipant(lessonId: string, callerId: string): Promise<Lesson> {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) {
      throw AppError.notAParticipant();
    }
    const participant = await this.prisma.lessonParticipant.findUnique({
      where: { lessonId_userId: { lessonId, userId: callerId } },
    });
    if (!participant) {
      throw AppError.notAParticipant();
    }
    return lesson;
  }

  private async buildView(lesson: Lesson, callerId: string): Promise<LessonRecordingView> {
    const participants = await this.prisma.lessonParticipant.findMany({ where: { lessonId: lesson.id } });
    const storageBytes = participants.reduce((sum, participant) => sum + Number(participant.audioBytes ?? 0n), 0);

    const mineRow = participants.find((participant) => participant.userId === callerId) ?? null;
    const branch = await this.state.getBranch(lesson.id, callerId);

    return {
      lessonId: lesson.id,
      lessonStatus: lesson.status,
      endReason: lesson.endReason,
      startedAt: lesson.startedAt?.toISOString() ?? null,
      endedAt: lesson.endedAt?.toISOString() ?? null,
      durationSeconds: lesson.durationSeconds,
      recordingStatus: lesson.recordingStatus as LessonRecordingStatus,
      storageBytes,
      mine: {
        recordingStatus: (mineRow?.recordingStatus ?? 'not_started') as ParticipantRecordingStatus,
        audioBytes: mineRow?.audioBytes != null ? Number(mineRow.audioBytes) : null,
        capturedSeconds: mineRow?.capturedMs != null ? Math.round(mineRow.capturedMs / 1000) : null,
        audioDurationSeconds: mineRow?.audioDurationMs != null ? Math.round(mineRow.audioDurationMs / 1000) : null,
        recordingStartedAt: mineRow?.recordingStartedAt?.toISOString() ?? null,
        branch: branch
          ? {
              stage: branch.stage as PipelineBranchStage,
              status: branch.status as PipelineBranchStatus,
              failureCode: branch.failureCode as RecordingFailureCode | null,
              failureReason: branch.failureReason,
              retryable:
                branch.status === 'storage_unavailable' ||
                (branch.status === 'failed' && branch.failureCode !== null && RETRYABLE_FAILURE_CODES.has(branch.failureCode)),
              fallbackPlanRequested: branch.fallbackRequestedAt !== null,
            }
          : null,
      },
    };
  }
}
