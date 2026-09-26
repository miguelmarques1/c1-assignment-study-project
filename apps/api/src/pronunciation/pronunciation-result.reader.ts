import { Injectable } from '@nestjs/common';
import type { ExcerptPronunciationStatus } from '@english-quest/shared';

import { PrismaService } from '../prisma/prisma.service';
import { storedWordsSchema, type StoredWord } from './excerpt-assessment.store';

export type StoredExcerptAssessmentStatus = 'pending' | 'assessed' | 'failed' | 'dropped' | 'abandoned';

/**
 * Collapses the store's five-way status to the three-way one both the
 * transcript badge and the pronunciation route show — a caller never needs
 * to know *why* an excerpt was not assessed, only whether it was. The one
 * mapping both surfaces share, so they can never quietly disagree.
 */
export function excerptPronunciationStatusView(status: StoredExcerptAssessmentStatus): ExcerptPronunciationStatus {
  if (status === 'assessed') {
    return 'assessed';
  }
  if (status === 'pending') {
    return 'pending';
  }
  return 'not_assessed';
}

export interface StoredPronunciationScores {
  pronunciation: number;
  accuracy: number;
  fluency: number;
  prosody: number | null;
  completeness: number;
}

export interface StoredWorstPhoneme {
  phoneme: string;
  meanAccuracy: number;
  occurrences: number;
  exampleWord: string;
  exampleExcerptId: string;
  exampleUtteranceId: string;
}

export interface StoredWorstWord {
  word: string;
  meanAccuracy: number;
  occurrences: number;
  errorTypes: string[];
  exampleExcerptId: string;
  exampleUtteranceId: string;
}

export interface StoredPhonemeTag {
  tag: string;
  phoneme: string;
  occurrences: number;
  meanAccuracy: number;
  exampleWords: string[];
}

export interface StoredPronunciationExcerpt {
  excerptId: string;
  utteranceId: string;
  rank: number;
  /** File offsets in the participant's `audio.ogg`. */
  startMs: number;
  endMs: number;
  referenceText: string;
  status: StoredExcerptAssessmentStatus;
  attempts: number;
  failureCode: string | null;
  scores: StoredPronunciationScores | null;
  words: StoredWord[] | null;
}

export interface StoredPronunciationResultSummary {
  /** The result row, replaced whenever the stage re-runs — F12's revision for this lesson's pronunciation source. */
  id: string;
  status: 'assessed' | 'no_sample';
  scores: StoredPronunciationScores | null;
  excerptCount: number;
  assessedCount: number;
  partialAssessment: boolean;
  sparseSample: boolean;
  quotaExhausted: boolean;
  assessedAudioMs: number;
  worstPhonemes: StoredWorstPhoneme[];
  worstWords: StoredWorstWord[];
  phonemeTags: StoredPhonemeTag[];
  selectionRuleVersion: string;
}

export interface StoredPronunciationView {
  result: StoredPronunciationResultSummary | null;
  excerpts: StoredPronunciationExcerpt[];
}

/**
 * The read side of F10: the participant's own result and every one of their
 * selected excerpts' own assessment, for F11's analysis input, F12's
 * pronunciation dimension and ledger tags, F19's routes and the transcript
 * badge. Always one owner at a time. `result` is null only before F10 has
 * ever completed for this participant (pending, blocked, retrying, or the
 * branch never reached this stage).
 */
@Injectable()
export class PronunciationResultReader {
  constructor(private readonly prisma: PrismaService) {}

  async forParticipant(lessonId: string, userId: string): Promise<StoredPronunciationView | null> {
    const [result, selection] = await Promise.all([
      this.prisma.lessonPronunciationResult.findUnique({ where: { lessonId_userId: { lessonId, userId } } }),
      this.prisma.lessonExcerptSelection.findUnique({
        where: { lessonId_userId: { lessonId, userId } },
        include: { excerpts: { orderBy: { rank: 'asc' }, include: { assessment: true } } },
      }),
    ]);
    if (!selection) {
      return null;
    }

    const excerpts: StoredPronunciationExcerpt[] = selection.excerpts.map((excerpt) => {
      const assessment = excerpt.assessment;
      const assessed = assessment?.status === 'assessed';
      return {
        excerptId: excerpt.id,
        utteranceId: excerpt.utteranceId,
        rank: excerpt.rank,
        startMs: excerpt.startMs,
        endMs: excerpt.endMs,
        referenceText: excerpt.referenceText,
        status: (assessment?.status ?? 'pending') as StoredExcerptAssessmentStatus,
        attempts: assessment?.attempts ?? 0,
        failureCode: assessment?.failureCode ?? null,
        scores: assessed
          ? {
              pronunciation: assessment.pronunciation!,
              accuracy: assessment.accuracy!,
              fluency: assessment.fluency!,
              prosody: assessment.prosody,
              completeness: assessment.completeness!,
            }
          : null,
        words: assessment?.words ? storedWordsSchema.parse(assessment.words) : null,
      };
    });

    if (!result) {
      return { result: null, excerpts };
    }

    return {
      result: {
        id: result.id,
        status: result.status as 'assessed' | 'no_sample',
        scores:
          result.status === 'assessed'
            ? {
                pronunciation: result.pronunciation!,
                accuracy: result.accuracy!,
                fluency: result.fluency!,
                prosody: result.prosody,
                completeness: result.completeness!,
              }
            : null,
        excerptCount: result.excerptCount,
        assessedCount: result.assessedCount,
        partialAssessment: result.partialAssessment,
        sparseSample: result.sparseSample,
        quotaExhausted: result.quotaExhausted,
        assessedAudioMs: result.assessedAudioMs,
        worstPhonemes: result.worstPhonemes as unknown as StoredWorstPhoneme[],
        worstWords: result.worstWords as unknown as StoredWorstWord[],
        phonemeTags: result.phonemeTags as unknown as StoredPhonemeTag[],
        selectionRuleVersion: selection.ruleVersion,
      },
      excerpts,
    };
  }
}
