import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { LoadedExcerptRules } from './excerpt-rules';
import type { ExcerptSelection } from './excerpt-selector';
import type { PronunciationFocus } from './pronunciation-focus.port';

export interface ExcerptWrite {
  lessonId: string;
  userId: string;
  transcriptId: string;
  rules: LoadedExcerptRules;
  focus: PronunciationFocus;
  selection: ExcerptSelection;
}

/**
 * Persists one participant's selection inside the stage's completing
 * transaction. It replaces whatever an earlier run left, so a manual retry
 * or a re-delivered job never leaves two selections side by side, and a
 * crash mid-insert leaves nothing behind.
 */
@Injectable()
export class ExcerptWriter {
  async replace(tx: Prisma.TransactionClient, input: ExcerptWrite): Promise<void> {
    const { lessonId, userId, transcriptId, rules, focus, selection } = input;

    // Deleting the header cascades to its excerpts.
    await tx.lessonExcerptSelection.deleteMany({ where: { lessonId, userId } });

    const header = await tx.lessonExcerptSelection.create({
      data: {
        lessonId,
        userId,
        transcriptId,
        ruleVersion: rules.version,
        ruleFingerprint: rules.fingerprint,
        rules: rules.rules as unknown as Prisma.InputJsonObject,
        focusSource: focus.source,
        focusTags: [...focus.tags],
        utteranceCount: selection.utteranceCount,
        eligibleCount: selection.eligibleCount,
        selectedCount: selection.selected.length,
        selectedAudioMs: selection.selectedAudioMs,
        sparseSample: selection.sparse,
      },
    });

    if (selection.selected.length === 0) {
      return;
    }
    await tx.lessonExcerpt.createMany({
      data: selection.selected.map((excerpt) => ({
        selectionId: header.id,
        lessonId,
        userId,
        utteranceId: excerpt.utteranceId,
        rank: excerpt.rank,
        startMs: excerpt.startMs,
        endMs: excerpt.endMs,
        referenceText: excerpt.referenceText,
        selectionRuleVersion: rules.version,
        confidence: excerpt.confidence,
        wordCount: excerpt.wordCount,
        fillerShare: excerpt.fillerShare,
        focusWordCount: excerpt.focusWordCount,
        reason: excerpt.reason,
      })),
    });
  }
}
