import { Injectable } from '@nestjs/common';
import type {
  LessonPronunciationResult,
  LessonPronunciationStatus,
  LessonPronunciationView,
  PronunciationExcerptView,
  PronunciationOverall,
} from '@english-quest/shared';

import { LessonAccessService } from '../pipeline/lesson-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { PRONUNCIATION_NOTES } from './pronunciation.constants';
import {
  excerptPronunciationStatusView,
  PronunciationResultReader,
  type StoredPronunciationExcerpt,
  type StoredPronunciationResultSummary,
} from './pronunciation-result.reader';

function toExcerptView(excerpt: StoredPronunciationExcerpt): PronunciationExcerptView {
  return {
    excerptId: excerpt.excerptId,
    utteranceId: excerpt.utteranceId,
    rank: excerpt.rank,
    referenceText: excerpt.referenceText,
    durationMs: excerpt.endMs - excerpt.startMs,
    pronunciation: {
      status: excerptPronunciationStatusView(excerpt.status),
      scores: excerpt.scores,
    },
  };
}

/** Server-built sentences, in the fixed order the PRD gives: sparse, partial, quota. */
function buildNotes(result: StoredPronunciationResultSummary): string[] {
  const notes: string[] = [];
  if (result.sparseSample) {
    notes.push(PRONUNCIATION_NOTES.sparse(result.assessedCount));
  }
  if (result.partialAssessment) {
    notes.push(PRONUNCIATION_NOTES.partial(result.assessedCount, result.excerptCount));
  }
  if (result.quotaExhausted) {
    notes.push(PRONUNCIATION_NOTES.quota);
  }
  return notes;
}

/**
 * The rounded headline score and its change (F19, A9). Rounding both sides
 * before subtracting keeps the displayed numbers adding up.
 */
function toOverall(pronunciation: number, previous: { pronunciation: number } | null): PronunciationOverall {
  const score = Math.round(pronunciation);
  return { score, delta: previous ? score - Math.round(previous.pronunciation) : null };
}

function toResultView(
  result: StoredPronunciationResultSummary,
  previous: { pronunciation: number } | null,
): LessonPronunciationResult {
  return {
    scores: result.scores!,
    overall: toOverall(result.scores!.pronunciation, previous),
    excerptCount: result.excerptCount,
    assessedCount: result.assessedCount,
    partialAssessment: result.partialAssessment,
    sparsePronunciationSample: result.sparseSample,
    quotaExhausted: result.quotaExhausted,
    notes: buildNotes(result),
    worstPhonemes: result.worstPhonemes,
    worstWords: result.worstWords,
  };
}

/**
 * Route logic for `GET /lessons/:lessonId/pronunciation`: the caller's own
 * truthful state, derived from their branch and the `pronunciation_assessment`
 * stage row, never another participant's. `excerpts` is populated as soon as
 * F09's selection exists, even while F10 has not settled yet — that is what
 * lets the client show `pending` badges before the stage completes.
 */
@Injectable()
export class PronunciationService {
  constructor(
    private readonly access: LessonAccessService,
    private readonly reader: PronunciationResultReader,
    private readonly prisma: PrismaService,
  ) {}

  async getView(lessonId: string, callerId: string): Promise<LessonPronunciationView> {
    const lesson = await this.access.requireParticipant(lessonId, callerId);

    const branch = await this.prisma.lessonPipelineBranch.findUnique({
      where: { lessonId_userId: { lessonId, userId: callerId } },
    });
    if (!branch) {
      return { lessonId, status: 'unavailable', result: null, excerpts: [] };
    }

    const stored = await this.reader.forParticipant(lessonId, callerId);
    const excerpts = stored?.excerpts.map(toExcerptView) ?? [];

    const stageRow = await this.prisma.lessonPipelineStage.findUnique({
      where: { branchId_stage: { branchId: branch.id, stage: 'pronunciation_assessment' } },
    });

    if (!stageRow) {
      const status: LessonPronunciationStatus = branch.status === 'failed' ? 'unavailable' : 'pending';
      return { lessonId, status, result: null, excerpts };
    }

    if (stageRow.status === 'failed') {
      return { lessonId, status: 'failed', result: null, excerpts };
    }
    if (stageRow.status !== 'completed') {
      return { lessonId, status: 'pending', result: null, excerpts };
    }
    if (!stored?.result) {
      // Unreachable in practice: the stage's own completing transaction
      // always writes the result before marking the stage row completed.
      return { lessonId, status: 'unavailable', result: null, excerpts };
    }
    if (stored.result.status === 'no_sample') {
      return { lessonId, status: 'no_sample', result: null, excerpts };
    }

    const previous = await this.reader.previousAssessedFor(callerId, lesson.startedAt);
    return { lessonId, status: 'assessed', result: toResultView(stored.result, previous), excerpts };
  }
}
