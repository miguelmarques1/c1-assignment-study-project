import { z } from 'zod';

import { excerptSelectionSummarySchema, transcriptExcerptSchema } from './excerpt';

/**
 * One recognized word. Azure fast transcription reports confidence per
 * phrase only, so `confidence` is `null` for every word it produced; the
 * utterance carries the phrase's value.
 */
export const transcriptWordSchema = z.object({
  text: z.string(),
  startMs: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1).nullable(),
});
export type TranscriptWord = z.infer<typeof transcriptWordSchema>;

/**
 * One utterance of the merged transcript, in milliseconds from the lesson's
 * start. `confidence` and `words` are present only on the caller's own
 * utterances: the conversation is shared, but recognition confidence is the
 * raw material of pronunciation selection, which is private. `excerpt` is
 * present only on the caller's own utterances that selection chose (F09).
 */
export const transcriptUtteranceSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  startMs: z.number().int(),
  endMs: z.number().int(),
  text: z.string(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  words: z.array(transcriptWordSchema).optional(),
  excerpt: transcriptExcerptSchema.optional(),
});
export type TranscriptUtterance = z.infer<typeof transcriptUtteranceSchema>;

/** Coarse on purpose: another participant's reason for `pending` or `unavailable` is theirs. */
export const transcriptSpeakerStatusSchema = z.enum(['available', 'pending', 'unavailable']);
export type TranscriptSpeakerStatus = z.infer<typeof transcriptSpeakerStatusSchema>;

export const transcriptSpeakerSchema = z.object({
  userId: z.uuid(),
  displayName: z.string(),
  isMe: z.boolean(),
  status: transcriptSpeakerStatusSchema,
});
export type TranscriptSpeaker = z.infer<typeof transcriptSpeakerSchema>;

/** Response body of `GET /lessons/:lessonId/transcript`. */
export const lessonTranscriptViewSchema = z.object({
  lessonId: z.uuid(),
  /** Time 0 of every `startMs` in the response. */
  lessonStartedAt: z.iso.datetime().nullable(),
  speakers: z.array(transcriptSpeakerSchema),
  /** The caller's own excerpt selection; null until it has run, or when the caller has no branch. */
  myExcerptSelection: excerptSelectionSummarySchema.nullable(),
  utterances: z.array(transcriptUtteranceSchema),
});
export type LessonTranscriptView = z.infer<typeof lessonTranscriptViewSchema>;
