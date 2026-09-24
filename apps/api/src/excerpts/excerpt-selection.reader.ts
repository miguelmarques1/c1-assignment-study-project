import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import { PrismaService } from '../prisma/prisma.service';

const focusTagsSchema = z.array(z.string());

export interface StoredExcerpt {
  id: string;
  utteranceId: string;
  rank: number;
  /** Offsets in the participant's `audio.ogg`, not lesson time — what F10 slices by. */
  startMs: number;
  endMs: number;
  /** The utterance's text, verbatim — F10's reference text. */
  referenceText: string;
  selectionRuleVersion: string;
  confidence: number | null;
  wordCount: number;
  fillerShare: number;
  focusWordCount: number;
  reason: string;
}

export interface StoredExcerptSelection {
  selection: {
    id: string;
    transcriptId: string;
    ruleVersion: string;
    ruleFingerprint: string;
    focusSource: string;
    focusTags: string[];
    utteranceCount: number;
    eligibleCount: number;
    selectedCount: number;
    selectedAudioMs: number;
    sparsePronunciationSample: boolean;
  };
  /** In `rank` order. */
  excerpts: StoredExcerpt[];
}

/**
 * The read side of F09: exactly the excerpts the stage stored for one
 * participant, for the transcript's badge and for F10, which must submit
 * this set with nothing added or dropped. Always one owner at a time.
 */
@Injectable()
export class ExcerptSelectionReader {
  constructor(private readonly prisma: PrismaService) {}

  /** Null when the participant's selection has not run. */
  async forParticipant(
    lessonId: string,
    userId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<StoredExcerptSelection | null> {
    const row = await client.lessonExcerptSelection.findUnique({
      where: { lessonId_userId: { lessonId, userId } },
      include: { excerpts: { orderBy: { rank: 'asc' } } },
    });
    if (!row) {
      return null;
    }

    return {
      selection: {
        id: row.id,
        transcriptId: row.transcriptId,
        ruleVersion: row.ruleVersion,
        ruleFingerprint: row.ruleFingerprint,
        focusSource: row.focusSource,
        focusTags: focusTagsSchema.parse(row.focusTags),
        utteranceCount: row.utteranceCount,
        eligibleCount: row.eligibleCount,
        selectedCount: row.selectedCount,
        selectedAudioMs: row.selectedAudioMs,
        sparsePronunciationSample: row.sparseSample,
      },
      excerpts: row.excerpts.map((excerpt) => ({
        id: excerpt.id,
        utteranceId: excerpt.utteranceId,
        rank: excerpt.rank,
        startMs: excerpt.startMs,
        endMs: excerpt.endMs,
        referenceText: excerpt.referenceText,
        selectionRuleVersion: excerpt.selectionRuleVersion,
        confidence: excerpt.confidence,
        wordCount: excerpt.wordCount,
        fillerShare: excerpt.fillerShare,
        focusWordCount: excerpt.focusWordCount,
        reason: excerpt.reason,
      })),
    };
  }
}
