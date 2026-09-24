import type { TranscriptWord } from '@english-quest/shared';
import { z } from 'zod';

import { SpeechServiceError } from './speech-errors';

/**
 * The part of the fast transcription response this feature reads. Unknown
 * keys are dropped. Words carry no confidence in this API — only phrases do.
 */
const providerWordSchema = z.object({
  text: z.string(),
  offsetMilliseconds: z.number().nonnegative(),
  durationMilliseconds: z.number().nonnegative(),
});

const providerPhraseSchema = z.object({
  offsetMilliseconds: z.number().nonnegative(),
  durationMilliseconds: z.number().nonnegative(),
  text: z.string(),
  words: z.array(providerWordSchema).optional(),
  confidence: z.number().optional(),
});

const providerResponseSchema = z.object({
  durationMilliseconds: z.number().nonnegative().optional(),
  phrases: z.array(providerPhraseSchema),
});

/** One utterance, offsets in the transcribed file. */
export interface RecognizedUtterance {
  idx: number;
  startMs: number;
  endMs: number;
  text: string;
  confidence: number | null;
  words: TranscriptWord[];
}

export interface RecognizedTranscript {
  audioDurationMs: number | null;
  utterances: RecognizedUtterance[];
}

function confidenceOf(value: number | undefined): number | null {
  if (value === undefined || Number.isNaN(value)) {
    return null;
  }
  return Math.min(Math.max(value, 0), 1);
}

/**
 * One phrase becomes one utterance, in offset order. A phrase with no text
 * is dropped rather than stored as an empty utterance, so "no speech" is an
 * empty list the handler can reject.
 */
export function parseFastTranscription(body: unknown): RecognizedTranscript {
  const parsed = providerResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new SpeechServiceError('Azure Speech returned a transcription in an unexpected format.');
  }

  const phrases = parsed.data.phrases
    .filter((phrase) => phrase.text.trim().length > 0)
    .sort((a, b) => a.offsetMilliseconds - b.offsetMilliseconds);

  return {
    audioDurationMs:
      parsed.data.durationMilliseconds === undefined ? null : Math.round(parsed.data.durationMilliseconds),
    utterances: phrases.map((phrase, idx) => {
      const startMs = Math.round(phrase.offsetMilliseconds);
      return {
        idx,
        startMs,
        endMs: Math.round(phrase.offsetMilliseconds + phrase.durationMilliseconds),
        text: phrase.text.trim(),
        confidence: confidenceOf(phrase.confidence),
        words: (phrase.words ?? []).map((word) => ({
          text: word.text,
          startMs: Math.round(word.offsetMilliseconds),
          durationMs: Math.round(word.durationMilliseconds),
          confidence: null,
        })),
      };
    }),
  };
}
