import { Injectable } from '@nestjs/common';
import {
  transcriptWordSchema,
  type ExcerptSelectionSummary,
  type LessonTranscriptView,
  type TranscriptExcerpt,
  type TranscriptSpeakerStatus,
} from '@english-quest/shared';
import type { LessonPipelineBranch } from '@prisma/client';
import { z } from 'zod';

import { ExcerptSelectionReader, type StoredExcerptSelection } from '../excerpts/excerpt-selection.reader';
import { LessonAccessService } from '../pipeline/lesson-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { mergeTranscript, type TranscriptTrack } from './transcript-merge';

const wordsSchema = z.array(transcriptWordSchema);

/** Recording states in which a participant's branch may still appear. */
const RECORDING_NOT_FINALIZED = new Set(['idle', 'starting', 'recording', 'not_recording', 'finalizing']);

/** Route logic for `GET /lessons/:lessonId/transcript`. */
@Injectable()
export class TranscriptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LessonAccessService,
    private readonly excerpts: ExcerptSelectionReader,
  ) {}

  async getView(lessonId: string, callerId: string): Promise<LessonTranscriptView> {
    const lesson = await this.access.requireParticipant(lessonId, callerId);

    const [participants, branches, transcripts, utterances, mySelection] = await Promise.all([
      this.prisma.lessonParticipant.findMany({
        where: { lessonId },
        include: { user: { select: { displayName: true } } },
      }),
      this.prisma.lessonPipelineBranch.findMany({ where: { lessonId } }),
      this.prisma.lessonTranscript.findMany({ where: { lessonId }, select: { userId: true } }),
      this.prisma.lessonUtterance.findMany({ where: { lessonId }, orderBy: [{ userId: 'asc' }, { idx: 'asc' }] }),
      // Only ever the caller's: another participant's selection is never read here.
      this.excerpts.forParticipant(lessonId, callerId),
    ]);

    const transcribed = new Set(transcripts.map((transcript) => transcript.userId));
    const branchOf = new Map(branches.map((branch) => [branch.userId, branch]));
    const stillFinalizing = RECORDING_NOT_FINALIZED.has(lesson.recordingStatus);

    const speakers = participants
      .filter((participant) => branchOf.has(participant.userId) || participant.userId === callerId)
      .map((participant) => ({
        userId: participant.userId,
        displayName: participant.user.displayName,
        isMe: participant.userId === callerId,
        status: this.speakerStatus(
          transcribed.has(participant.userId),
          branchOf.get(participant.userId),
          stillFinalizing,
        ),
      }));

    const tracks: TranscriptTrack[] = participants
      .filter((participant) => transcribed.has(participant.userId))
      .map((participant) => ({
        userId: participant.userId,
        recordingStartedAt: participant.recordingStartedAt,
        utterances: utterances
          .filter((utterance) => utterance.userId === participant.userId)
          .map((utterance) => ({
            id: utterance.id,
            idx: utterance.idx,
            startMs: utterance.startMs,
            endMs: utterance.endMs,
            text: utterance.text,
            confidence: utterance.confidence,
            words: wordsSchema.parse(utterance.words),
          })),
      }));

    return {
      lessonId: lesson.id,
      lessonStartedAt: lesson.startedAt?.toISOString() ?? null,
      speakers,
      myExcerptSelection: mySelection ? this.summary(mySelection) : null,
      utterances: mergeTranscript(lesson.startedAt, callerId, tracks, this.badges(mySelection)),
    };
  }

  private summary({ selection }: StoredExcerptSelection): ExcerptSelectionSummary {
    return {
      ruleVersion: selection.ruleVersion,
      utteranceCount: selection.utteranceCount,
      eligibleCount: selection.eligibleCount,
      selectedCount: selection.selectedCount,
      selectedAudioMs: selection.selectedAudioMs,
      sparsePronunciationSample: selection.sparsePronunciationSample,
    };
  }

  /** The caller's badges, by utterance id. */
  private badges(mine: StoredExcerptSelection | null): Map<string, TranscriptExcerpt> {
    return new Map(
      (mine?.excerpts ?? []).map((excerpt) => [
        excerpt.utteranceId,
        {
          rank: excerpt.rank,
          reason: excerpt.reason,
          confidence: excerpt.confidence,
          wordCount: excerpt.wordCount,
          durationMs: excerpt.endMs - excerpt.startMs,
          focusWordCount: excerpt.focusWordCount,
          ruleVersion: excerpt.selectionRuleVersion,
        },
      ]),
    );
  }

  /**
   * Coarse on purpose: another participant's reason for being pending or
   * unavailable (a missing key, a failed recording) is theirs, not the
   * group's. Anything still recoverable reads as pending.
   */
  private speakerStatus(
    transcribed: boolean,
    branch: LessonPipelineBranch | undefined,
    stillFinalizing: boolean,
  ): TranscriptSpeakerStatus {
    if (transcribed) {
      return 'available';
    }
    if (!branch) {
      return stillFinalizing ? 'pending' : 'unavailable';
    }
    return branch.status === 'failed' ? 'unavailable' : 'pending';
  }
}
