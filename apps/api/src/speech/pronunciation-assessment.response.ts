import { z } from 'zod';

import { SpeechNoRecognitionError, SpeechServiceError } from './speech-errors';

/**
 * The part of Azure's detailed pronunciation assessment response this
 * feature reads. Verified live against the real endpoint (see the spec's
 * live checklist): every score sits flat on its own object — `NBest[i]`
 * carries the five lesson-level scores directly, `Words[i]` carries
 * `AccuracyScore`/`ErrorType` directly, `Phonemes[i]` carries `AccuracyScore`
 * directly — none of them nested under a `PronunciationAssessment` child, as
 * the SDK's own config object might suggest. `PhonemeAlphabet: IPA` already
 * returns real IPA symbols over REST, so no SAPI fallback is needed.
 * Offsets and durations are 100 ns ticks; an `Omission` word still carries
 * `Offset`/`Duration`/`AccuracyScore`, all zero, since nothing was spoken.
 * Unknown keys (`Syllables`, `SNR`, `Confidence`, …) are dropped.
 */
const providerPhonemeSchema = z.object({
  Phoneme: z.string(),
  Offset: z.number().nonnegative().optional(),
  Duration: z.number().nonnegative().optional(),
  AccuracyScore: z.number().optional(),
});

const providerErrorTypesSchema = z.object({ ErrorTypes: z.array(z.string()).optional() }).optional();

const providerWordSchema = z.object({
  Word: z.string(),
  Offset: z.number().nonnegative().optional(),
  Duration: z.number().nonnegative().optional(),
  AccuracyScore: z.number().optional(),
  ErrorType: z.string().optional(),
  Feedback: z
    .object({
      Prosody: z
        .object({
          Break: providerErrorTypesSchema,
          Intonation: providerErrorTypesSchema,
        })
        .optional(),
    })
    .optional(),
  Phonemes: z.array(providerPhonemeSchema).optional(),
});

const providerNBestSchema = z.object({
  Display: z.string().optional(),
  AccuracyScore: z.number(),
  FluencyScore: z.number(),
  ProsodyScore: z.number().optional(),
  CompletenessScore: z.number(),
  PronScore: z.number(),
  Words: z.array(providerWordSchema).default([]),
});

const providerResponseSchema = z.object({
  RecognitionStatus: z.string(),
  DisplayText: z.string().optional(),
  NBest: z.array(providerNBestSchema).optional(),
});

export interface MappedPhoneme {
  phoneme: string;
  accuracy: number;
  offsetMs: number;
  durationMs: number;
}

export interface MappedWord {
  word: string;
  /** 0 for an `Omission` entry, which Azure never scores. */
  accuracy: number;
  errorTypes: string[];
  offsetMs: number;
  durationMs: number;
  phonemes: MappedPhoneme[];
}

export interface MappedPronunciationResult {
  scores: {
    pronunciation: number;
    accuracy: number;
    fluency: number;
    prosody: number | null;
    completeness: number;
  };
  words: MappedWord[];
  recognizedText: string;
}

/** 100 ns per tick, so 10,000 ticks per millisecond. */
function msFromTicks(ticks: number | undefined): number {
  return ticks === undefined ? 0 : Math.round(ticks / 10_000);
}

/**
 * Validates the detailed REST result and maps it to the five scores, words
 * with merged error types (word-level plus prosody's break and intonation
 * feedback, `None` dropped) and phonemes, offsets turned from ticks into
 * clip-relative milliseconds. A status other than `Success` — nothing usable
 * to assess — and a malformed body are both errors the caller can retry.
 */
export function parsePronunciationAssessment(body: unknown): MappedPronunciationResult {
  const parsed = providerResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new SpeechServiceError('Azure Speech returned a pronunciation assessment in an unexpected format.');
  }

  if (parsed.data.RecognitionStatus !== 'Success') {
    throw new SpeechNoRecognitionError(`Azure Speech reported ${parsed.data.RecognitionStatus}.`);
  }

  const best = parsed.data.NBest?.[0];
  if (!best) {
    throw new SpeechServiceError('Azure Speech returned a pronunciation assessment with no result.');
  }

  return {
    scores: {
      pronunciation: best.PronScore,
      accuracy: best.AccuracyScore,
      fluency: best.FluencyScore,
      prosody: best.ProsodyScore ?? null,
      completeness: best.CompletenessScore,
    },
    recognizedText: best.Display ?? parsed.data.DisplayText ?? '',
    words: best.Words.map((word) => {
      const errorTypes = [
        word.ErrorType,
        ...(word.Feedback?.Prosody?.Break?.ErrorTypes ?? []),
        ...(word.Feedback?.Prosody?.Intonation?.ErrorTypes ?? []),
      ].filter((type): type is string => Boolean(type) && type !== 'None');

      return {
        word: word.Word,
        accuracy: word.AccuracyScore ?? 0,
        errorTypes,
        offsetMs: msFromTicks(word.Offset),
        durationMs: msFromTicks(word.Duration),
        phonemes: (word.Phonemes ?? []).map((phoneme) => ({
          phoneme: phoneme.Phoneme,
          accuracy: phoneme.AccuracyScore ?? 0,
          offsetMs: msFromTicks(phoneme.Offset),
          durationMs: msFromTicks(phoneme.Duration),
        })),
      };
    }),
  };
}
