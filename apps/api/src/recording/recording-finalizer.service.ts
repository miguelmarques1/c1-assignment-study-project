import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import type { Lesson, LessonParticipant, LessonRecordingSegment } from '@prisma/client';
import type { ParticipantRecordingStatus } from '@english-quest/shared';

import { StorageUnavailableError, StorageService } from '../storage/storage.service';
import { AudioAssembler } from './audio-assembler.service';
import { classifyParticipant, deriveLessonStatus, type ParticipantClassification } from './recording-classifier';
import { EgressService } from './egress.service';
import { PipelineLaunchPort } from './pipeline-launch.port';
import { RecordingStateService } from './recording-state.service';
import { StudyPlanFallbackPort } from './study-plan-fallback.port';
import {
  MIN_AUDIO_BYTES,
  MIN_LESSON_DURATION_SECONDS,
  EGRESS_SETTLE_SECONDS,
  STORAGE_UNAVAILABLE_WINDOW_SECONDS,
  audioObjectKey,
} from './recording.constants';

const OPEN_SEGMENT_STATUSES = new Set(['requested', 'starting', 'active', 'ending']);

/** One participant's assembled outcome, computed but not yet written — the finalizer commits it only once no one this pass hit a storage failure. */
interface ParticipantWork {
  userId: string;
  classification: ParticipantClassification;
  recordingStartedAt: Date | null;
  segmentKeysToDelete: string[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Finalizes one ended lesson's recording: stops any egress still open,
 * waits for (or reconciles) every segment, assembles and verifies each
 * connected participant's audio, classifies the outcome, writes the branch,
 * and calls the two seams exactly once per branch. A participant already
 * `launchedAt` from an earlier pass is skipped entirely — their segment
 * objects were deleted once verified, so re-processing them would fail for
 * no reason on a retry triggered by a *different* participant's failure.
 */
@Injectable()
export class RecordingFinalizerService {
  private readonly logger = new Logger(RecordingFinalizerService.name);

  constructor(
    private readonly state: RecordingStateService,
    private readonly egress: EgressService,
    private readonly storage: StorageService,
    private readonly assembler: AudioAssembler,
    private readonly launchPort: PipelineLaunchPort,
    private readonly fallbackPort: StudyPlanFallbackPort,
  ) {}

  async finalize(lesson: Lesson, now: Date): Promise<void> {
    let segments = await this.state.listSegments(lesson.id);

    const settled = await this.settle(lesson, segments, now);
    if (!settled) {
      await this.state.releaseLease(lesson.id);
      return;
    }
    segments = await this.state.listSegments(lesson.id);

    const participants = await this.state.listConnectedParticipants(lesson.id);
    const { work, storageFailed } = await this.assembleAll(lesson, participants, segments);

    if (storageFailed) {
      await this.handleStorageFailure(lesson, participants, now);
      return;
    }

    if ((lesson.durationSeconds ?? 0) < MIN_LESSON_DURATION_SECONDS) {
      // Audio was still assembled and uploaded above for whoever had any —
      // "Recordings are retained indefinitely" applies even to a lesson too
      // short to analyze. No branches, no seam calls.
      await this.state.finalizeLessonRecording(lesson.id, 'too_short', now);
      return;
    }

    await this.commit(lesson, participants, work, now);
  }

  /**
   * Stops any egress still technically open, then waits up to
   * `EGRESS_SETTLE_SECONDS` for every segment to report a terminal status.
   * Past that window, reconciles against LiveKit's own view: a segment it no
   * longer tracks is marked failed directly. Returns false when finalization
   * should defer to the next tick (still waiting, or LiveKit unreachable).
   */
  private async settle(lesson: Lesson, segments: LessonRecordingSegment[], now: Date): Promise<boolean> {
    const open = segments.filter((segment) => OPEN_SEGMENT_STATUSES.has(segment.status));
    if (open.length === 0) {
      return true;
    }

    for (const segment of open) {
      if (segment.egressId) {
        await this.egress.stopEgress(segment.egressId).catch(() => undefined);
      }
    }

    const finalizingSince = lesson.recordingFinalizingSince ?? now;
    const elapsed = now.getTime() - finalizingSince.getTime();
    if (elapsed < EGRESS_SETTLE_SECONDS * 1000) {
      return false;
    }

    let liveEgresses;
    try {
      liveEgresses = await this.egress.listEgress();
    } catch (error) {
      this.logger.warn(`Could not reconcile egress for lesson ${lesson.id}: ${errorMessage(error)}`);
      return false;
    }

    const stillTracked = new Set(liveEgresses.map((info) => info.egressId));
    for (const segment of open) {
      if (!segment.egressId || !stillTracked.has(segment.egressId)) {
        await this.state.reconcileSegment(segment.id);
      }
    }

    const afterReconcile = await this.state.listSegments(lesson.id);
    return !afterReconcile.some((segment) => OPEN_SEGMENT_STATUSES.has(segment.status));
  }

  /**
   * Assembles and verifies every connected participant's audio. Computes
   * each outcome without writing anything, so a storage failure partway
   * through never leaves one participant committed while another is stuck —
   * `commit` applies every write in one pass, only once this returns clean.
   */
  private async assembleAll(
    lesson: Lesson,
    participants: LessonParticipant[],
    segments: LessonRecordingSegment[],
  ): Promise<{ work: ParticipantWork[]; storageFailed: boolean }> {
    const work: ParticipantWork[] = [];

    for (const participant of participants) {
      const existingBranch = await this.state.getBranch(lesson.id, participant.userId);
      if (existingBranch?.launchedAt) {
        // Already fully processed on an earlier pass — their segment
        // objects are gone (deleted once verified), so there is nothing left to redo.
        continue;
      }

      const userSegments = segments.filter((segment) => segment.userId === participant.userId);
      const completeSegments = userSegments.filter(
        (segment) => segment.status === 'complete' && segment.fileStartedAt && segment.fileEndedAt,
      );
      const hadUnexpectedEnd = userSegments.some((segment) => segment.unexpected);
      const capturedMs = completeSegments.reduce(
        (sum, segment) => sum + Math.max(segment.fileEndedAt!.getTime() - segment.fileStartedAt!.getTime(), 0),
        0,
      );

      if (completeSegments.length === 0) {
        work.push({
          userId: participant.userId,
          classification: classifyParticipant({
            liveStatus: participant.recordingStatus as ParticipantRecordingStatus,
            assemblyAttempted: userSegments.length > 0,
            capturedMs: 0,
            hadUnexpectedEnd,
            assemblyFailed: false,
            verifiedAudio: null,
          }),
          recordingStartedAt: null,
          segmentKeysToDelete: [],
        });
        continue;
      }

      const tmpDir = await mkdtemp(join(tmpdir(), 'f07-'));
      try {
        const localSegments = [];
        for (const segment of completeSegments) {
          // `statObject` first, not a direct download: it is the one
          // adapter method that tells a missing object apart from an
          // unreachable store. A segment marked `complete` but missing its
          // object (should never happen from a real egress, but must not be
          // allowed to loop forever if it somehow does) is dropped from this
          // assembly rather than thrown as an uncaught error — the
          // participant is classified on whatever segments genuinely exist.
          const size = await this.storage.statObject(segment.objectKey);
          if (size === null) {
            this.logger.warn(
              `Segment object missing for lesson ${lesson.id}, user ${participant.userId}: ${segment.objectKey}`,
            );
            continue;
          }
          const localPath = join(tmpDir, `${segment.id}.ogg`);
          await this.storage.downloadToFile(segment.objectKey, localPath);
          localSegments.push({
            filePath: localPath,
            fileStartedAt: segment.fileStartedAt!,
            fileEndedAt: segment.fileEndedAt!,
          });
        }

        if (localSegments.length === 0) {
          work.push({
            userId: participant.userId,
            classification: classifyParticipant({
              liveStatus: participant.recordingStatus as ParticipantRecordingStatus,
              assemblyAttempted: true,
              capturedMs: 0,
              hadUnexpectedEnd,
              assemblyFailed: false,
              verifiedAudio: null,
            }),
            recordingStartedAt: null,
            segmentKeysToDelete: [],
          });
          continue;
        }

        let assembly: Awaited<ReturnType<AudioAssembler['assemble']>> | null = null;
        let assemblyFailed = false;
        try {
          assembly = await this.assembler.assemble(localSegments, join(tmpDir, 'audio.ogg'));
        } catch (error) {
          assemblyFailed = true;
          this.logger.warn(
            `Assembly failed for lesson ${lesson.id}, user ${participant.userId}: ${errorMessage(error)}`,
          );
        }

        let verifiedAudio: { bytes: number; durationMs: number } | null = null;
        if (assembly) {
          const key = audioObjectKey(lesson.id, participant.userId);
          await this.storage.uploadFile(key, assembly.outputPath);
          const size = await this.storage.statObject(key);
          if (size !== null && size > MIN_AUDIO_BYTES) {
            verifiedAudio = { bytes: size, durationMs: assembly.durationMs };
          }
        }

        work.push({
          userId: participant.userId,
          classification: classifyParticipant({
            liveStatus: participant.recordingStatus as ParticipantRecordingStatus,
            assemblyAttempted: true,
            capturedMs,
            hadUnexpectedEnd,
            assemblyFailed,
            verifiedAudio,
          }),
          recordingStartedAt: verifiedAudio ? assembly!.recordingStartedAt : null,
          segmentKeysToDelete: verifiedAudio ? completeSegments.map((segment) => segment.objectKey) : [],
        });
      } catch (error) {
        if (error instanceof StorageUnavailableError) {
          return { work, storageFailed: true };
        }
        throw error;
      } finally {
        await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
      }
    }

    return { work, storageFailed: false };
  }

  private async handleStorageFailure(lesson: Lesson, participants: LessonParticipant[], now: Date): Promise<void> {
    const since = lesson.storageUnavailableSince ?? now;
    await this.state.recordStorageFailureStart(lesson.id, since);

    if (now.getTime() - since.getTime() < STORAGE_UNAVAILABLE_WINDOW_SECONDS * 1000) {
      await this.state.releaseLease(lesson.id);
      return;
    }

    await this.state.markLessonStorageUnavailable(lesson.id, since);
    await this.state.markBranchesStorageUnavailable(
      lesson.id,
      participants.map((participant) => participant.userId),
    );
  }

  private async commit(
    lesson: Lesson,
    participants: LessonParticipant[],
    work: ParticipantWork[],
    now: Date,
  ): Promise<void> {
    for (const item of work) {
      await this.state.writeParticipantResult(lesson.id, item.userId, item.classification);
      if (item.recordingStartedAt) {
        await this.state.writeParticipantRecordingStartedAt(lesson.id, item.userId, item.recordingStartedAt);
      }
      if (item.segmentKeysToDelete.length > 0) {
        await this.storage.deleteObjects(item.segmentKeysToDelete).catch((error: unknown) => {
          this.logger.warn(
            `Could not delete segment objects for lesson ${lesson.id}, user ${item.userId}: ${errorMessage(error)}`,
          );
        });
      }

      const branch = await this.state.upsertBranch(lesson.id, item.userId, item.classification);

      if (item.classification.launches && !branch.launchedAt) {
        await this.launchPort.launch({
          lessonId: lesson.id,
          userId: item.userId,
          audioObjectKey: audioObjectKey(lesson.id, item.userId),
          recordingStartedAt: item.recordingStartedAt!,
          audioDurationMs: item.classification.audioDurationMs!,
          capturedMs: item.classification.capturedMs,
        });
        await this.state.markBranchLaunched(branch.id, now);
      }

      if (item.classification.requiresFallbackPlan && !branch.fallbackRequestedAt) {
        await this.fallbackPort.requestFallbackPlan({
          lessonId: lesson.id,
          userId: item.userId,
          failureCode: item.classification.failureCode!,
        });
        await this.state.markBranchFallbackRequested(branch.id, now);
      }
    }

    // A participant skipped by `assembleAll` (already `launchedAt`) still
    // counts as launched for the lesson-wide status derivation below.
    const outcomes = participants.map((participant) => {
      const item = work.find((entry) => entry.userId === participant.userId);
      return item ? item.classification : ({ launches: true } as ParticipantClassification);
    });

    const lessonStatus = deriveLessonStatus(outcomes, lesson.durationSeconds ?? 0);
    await this.state.finalizeLessonRecording(lesson.id, lessonStatus, now);
  }
}
