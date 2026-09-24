import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PRONUNCIATION_PROVIDER } from '../speech/speech.constants';
import type { AggregateResult } from './pronunciation-aggregate';

export type PronunciationResultWrite =
  | { status: 'no_sample'; lessonId: string; userId: string; selectionId: string; locale: string }
  | {
      status: 'assessed';
      lessonId: string;
      userId: string;
      selectionId: string;
      locale: string;
      excerptCount: number;
      sparseSample: boolean;
      quotaExhausted: boolean;
      result: AggregateResult;
    };

/**
 * Replaces the participant's per-lesson result inside the stage's
 * completing transaction — the same transaction that marks the stage
 * `completed` and queues `lesson_analysis`, so the result and the stage's
 * own state can never disagree. `notes` are never stored: the route derives
 * them fresh from the flags, the way the stage's own `reason` is derived.
 */
@Injectable()
export class PronunciationResultWriter {
  async replace(tx: Prisma.TransactionClient, input: PronunciationResultWrite): Promise<void> {
    await tx.lessonPronunciationResult.deleteMany({ where: { lessonId: input.lessonId, userId: input.userId } });

    if (input.status === 'no_sample') {
      await tx.lessonPronunciationResult.create({
        data: {
          lessonId: input.lessonId,
          userId: input.userId,
          selectionId: input.selectionId,
          status: 'no_sample',
          excerptCount: 0,
          assessedCount: 0,
          partialAssessment: false,
          sparseSample: false,
          quotaExhausted: false,
          assessedAudioMs: 0,
          worstPhonemes: [],
          worstWords: [],
          phonemeTags: [],
          provider: PRONUNCIATION_PROVIDER,
          locale: input.locale,
          phonemeAlphabet: 'IPA',
        },
      });
      return;
    }

    const { result } = input;
    await tx.lessonPronunciationResult.create({
      data: {
        lessonId: input.lessonId,
        userId: input.userId,
        selectionId: input.selectionId,
        status: 'assessed',
        excerptCount: input.excerptCount,
        assessedCount: result.assessedCount,
        partialAssessment: result.partialAssessment,
        sparseSample: input.sparseSample,
        quotaExhausted: input.quotaExhausted,
        pronunciation: result.scores.pronunciation,
        accuracy: result.scores.accuracy,
        fluency: result.scores.fluency,
        prosody: result.scores.prosody,
        completeness: result.scores.completeness,
        assessedAudioMs: result.assessedAudioMs,
        worstPhonemes: result.worstPhonemes as unknown as Prisma.InputJsonValue,
        worstWords: result.worstWords as unknown as Prisma.InputJsonValue,
        phonemeTags: result.phonemeTags as unknown as Prisma.InputJsonValue,
        provider: PRONUNCIATION_PROVIDER,
        locale: input.locale,
        phonemeAlphabet: 'IPA',
      },
    });
  }
}
