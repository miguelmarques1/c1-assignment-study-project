import { z } from 'zod';

/**
 * The five Azure Pronunciation Assessment scores, 0-100. `prosody` is null
 * where the assessment locale doesn't report it (F10).
 */
export const pronunciationScoresSchema = z.object({
  pronunciation: z.number().min(0).max(100),
  accuracy: z.number().min(0).max(100),
  fluency: z.number().min(0).max(100),
  prosody: z.number().min(0).max(100).nullable(),
  completeness: z.number().min(0).max(100),
});
export type PronunciationScores = z.infer<typeof pronunciationScoresSchema>;

/** An excerpt's own assessment state, identical on the transcript badge and the pronunciation route (F10). */
export const excerptPronunciationStatusSchema = z.enum(['pending', 'assessed', 'not_assessed']);
export type ExcerptPronunciationStatus = z.infer<typeof excerptPronunciationStatusSchema>;

export const excerptPronunciationSchema = z.object({
  status: excerptPronunciationStatusSchema,
  scores: pronunciationScoresSchema.nullable(),
});
export type ExcerptPronunciation = z.infer<typeof excerptPronunciationSchema>;

export const worstPhonemeSchema = z.object({
  phoneme: z.string(),
  meanAccuracy: z.number().min(0).max(100),
  occurrences: z.number().int().positive(),
  exampleWord: z.string(),
  exampleUtteranceId: z.uuid(),
});
export type WorstPhoneme = z.infer<typeof worstPhonemeSchema>;

export const worstWordSchema = z.object({
  word: z.string(),
  meanAccuracy: z.number().min(0).max(100),
  occurrences: z.number().int().positive(),
  errorTypes: z.array(z.string()),
  exampleUtteranceId: z.uuid(),
});
export type WorstWord = z.infer<typeof worstWordSchema>;

/** One selected excerpt as it appears in the caller's pronunciation view (F10). */
export const pronunciationExcerptViewSchema = z.object({
  excerptId: z.uuid(),
  utteranceId: z.uuid(),
  rank: z.number().int().positive(),
  referenceText: z.string(),
  durationMs: z.number().int().positive(),
  pronunciation: excerptPronunciationSchema,
});
export type PronunciationExcerptView = z.infer<typeof pronunciationExcerptViewSchema>;

/** The caller's own state at `GET /lessons/:lessonId/pronunciation` (F10). */
export const lessonPronunciationStatusSchema = z.enum(['pending', 'assessed', 'no_sample', 'failed', 'unavailable']);
export type LessonPronunciationStatus = z.infer<typeof lessonPronunciationStatusSchema>;

export const lessonPronunciationResultSchema = z.object({
  scores: pronunciationScoresSchema,
  excerptCount: z.number().int().nonnegative(),
  assessedCount: z.number().int().nonnegative(),
  partialAssessment: z.boolean(),
  sparsePronunciationSample: z.boolean(),
  quotaExhausted: z.boolean(),
  notes: z.array(z.string()),
  worstPhonemes: z.array(worstPhonemeSchema).max(5),
  worstWords: z.array(worstWordSchema).max(10),
});
export type LessonPronunciationResult = z.infer<typeof lessonPronunciationResultSchema>;

/** Response body of `GET /lessons/:lessonId/pronunciation` — the caller's own data only. */
export const lessonPronunciationViewSchema = z.object({
  lessonId: z.uuid(),
  status: lessonPronunciationStatusSchema,
  result: lessonPronunciationResultSchema.nullable(),
  excerpts: z.array(pronunciationExcerptViewSchema),
});
export type LessonPronunciationView = z.infer<typeof lessonPronunciationViewSchema>;
