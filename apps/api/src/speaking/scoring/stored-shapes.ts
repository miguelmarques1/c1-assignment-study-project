import { z } from 'zod';

/**
 * How `speaking_attempts.words`, `.failing_phonemes` and `.segments` round
 * trip through their `jsonb` columns. `words` stores the raw merged
 * evidence (`MergedWord[]`, phonemes included) rather than the client-facing
 * display words: the view is a pure function of this plus the task's own
 * reference text, so it is always derived fresh and never drifts from it.
 */
export const storedPhonemeSchema = z.object({
  phoneme: z.string(),
  accuracy: z.number(),
  offsetMs: z.number(),
  durationMs: z.number(),
});

export const storedWordSchema = z.object({
  word: z.string(),
  accuracy: z.number(),
  errorTypes: z.array(z.string()),
  startMs: z.number(),
  durationMs: z.number(),
  phonemes: z.array(storedPhonemeSchema),
});
export const storedWordsSchema = z.array(storedWordSchema);

export const storedFailingExampleSchema = z.object({
  word: z.string(),
  startMs: z.number(),
  durationMs: z.number(),
  accuracy: z.number(),
});

export const storedFailingPhonemeSchema = z.object({
  tag: z.string(),
  instances: z.number(),
  meanAccuracy: z.number(),
  examples: z.array(storedFailingExampleSchema),
});
export const storedFailingPhonemesSchema = z.array(storedFailingPhonemeSchema);

const storedScoresSchema = z.object({
  pronunciation: z.number(),
  accuracy: z.number(),
  fluency: z.number(),
  prosody: z.number().nullable(),
  completeness: z.number(),
});

export const storedSegmentSchema = z.object({
  startMs: z.number(),
  endMs: z.number(),
  referenceText: z.string(),
  scores: storedScoresSchema,
  latencyMs: z.number(),
});
export const storedSegmentsSchema = z.array(storedSegmentSchema);
