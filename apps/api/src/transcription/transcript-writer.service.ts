import { Injectable } from '@nestjs/common';
import { transcriptWordSchema } from '@english-quest/shared';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import type { SpeechTranscription } from '../speech/speech-to-text.service';

const wordsSchema = z.array(transcriptWordSchema);

/**
 * Persists one participant's transcript inside the stage's completing
 * transaction. It replaces whatever an earlier run left, so a retry never
 * leaves two versions side by side, and it only ever runs inside that
 * transaction, so a crash mid-insert leaves nothing behind.
 */
@Injectable()
export class TranscriptWriter {
  async replace(
    tx: Prisma.TransactionClient,
    input: { lessonId: string; userId: string; transcription: SpeechTranscription },
  ): Promise<void> {
    const { lessonId, userId, transcription } = input;

    // Deleting the header cascades to its utterances.
    await tx.lessonTranscript.deleteMany({ where: { lessonId, userId } });

    const transcript = await tx.lessonTranscript.create({
      data: {
        lessonId,
        userId,
        provider: transcription.provider,
        apiVersion: transcription.apiVersion,
        locale: transcription.locale,
        audioDurationMs: transcription.audioDurationMs,
        latencyMs: transcription.latencyMs,
        utteranceCount: transcription.utterances.length,
        wordCount: transcription.utterances.reduce((sum, utterance) => sum + utterance.words.length, 0),
      },
    });

    await this.insertUtterances(tx, transcript.id, lessonId, userId, transcription);
  }

  /** Separate so a test can fail it halfway and prove the transaction takes the header down with it. */
  protected async insertUtterances(
    tx: Prisma.TransactionClient,
    transcriptId: string,
    lessonId: string,
    userId: string,
    transcription: SpeechTranscription,
  ): Promise<void> {
    await tx.lessonUtterance.createMany({
      data: transcription.utterances.map((utterance) => ({
        transcriptId,
        lessonId,
        userId,
        idx: utterance.idx,
        startMs: utterance.startMs,
        endMs: utterance.endMs,
        text: utterance.text,
        confidence: utterance.confidence,
        words: wordsSchema.parse(utterance.words),
      })),
    });
  }
}
