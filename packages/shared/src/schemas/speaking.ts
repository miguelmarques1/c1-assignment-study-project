import { z } from 'zod';

import { difficultyRatingSchema, planActivityStateSchema, planTagSchema, studyPlanStatusSchema } from './plan';
import { pronunciationScoresSchema, pronunciationWordBandSchema } from './pronunciation';

/**
 * F18's speaking and pronunciation activities. A read-aloud is assessed
 * directly against its passage; an open response is transcribed first and
 * assessed against its own transcript. Both go through F10's clip capability
 * and the same score set as a lesson excerpt. No user id anywhere in the
 * shape: every view is the caller's own.
 */

export const speakingShapeSchema = z.enum(['read_aloud', 'open_response']);
export type SpeakingShape = z.infer<typeof speakingShapeSchema>;

export const speakingAttemptStateSchema = z.enum(['scoring', 'scored', 'discarded', 'failed']);
export type SpeakingAttemptState = z.infer<typeof speakingAttemptStateSchema>;

/** Covers both a discard reason (`not_enough_speech`) and every scoring failure (A13). */
export const speakingFailureCodeSchema = z.enum([
  'not_enough_speech',
  'azure_key_missing',
  'azure_key_rejected',
  'azure_quota',
  'azure_region_unsupported',
  'service_error',
  'interrupted',
  'internal_error',
  'audio_rejected',
  'audio_missing',
]);
export type SpeakingFailureCode = z.infer<typeof speakingFailureCodeSchema>;

/** Why nothing can be recorded, most fundamental first: archived, skipped, key. */
export const speakingBlockSchema = z.enum(['azure_key_missing', 'plan_archived', 'activity_skipped']);
export type SpeakingBlock = z.infer<typeof speakingBlockSchema>;

export const speakingFailureSchema = z.object({
  code: speakingFailureCodeSchema,
  message: z.string(),
  rescorable: z.boolean(),
});
export type SpeakingFailure = z.infer<typeof speakingFailureSchema>;

/**
 * One display token (A11): the reference text or the transcript, tokenized
 * and aligned to the assessed words. An unmatched token has no band; an
 * `Insertion` is hidden entirely; an `Omission` shows as `poor` with no
 * recording offsets, since nothing was spoken.
 */
export const speakingWordSchema = z.object({
  text: z.string(),
  band: pronunciationWordBandSchema.nullable(),
  accuracy: z.number().int().min(0).max(100).nullable(),
  errorTypes: z.array(z.string()),
  startMs: z.number().int().nonnegative().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
});
export type SpeakingWord = z.infer<typeof speakingWordSchema>;

export const speakingFailingPhonemeSchema = z.object({
  tag: z.string(),
  label: z.string(),
  meanAccuracy: z.number().min(0).max(100),
  instances: z.number().int().positive(),
  exampleWord: z.string(),
  exampleStartMs: z.number().int().nonnegative().nullable(),
  exampleDurationMs: z.number().int().nonnegative().nullable(),
});
export type SpeakingFailingPhoneme = z.infer<typeof speakingFailingPhonemeSchema>;

export const speakingAttemptResultSchema = z.object({
  scores: pronunciationScoresSchema,
  recognizedWordCount: z.number().int().min(0),
  /** Set for an open response — its own transcript, which became the reference. */
  transcript: z.string().nullable(),
  words: z.array(speakingWordSchema),
  failingPhonemes: z.array(speakingFailingPhonemeSchema).max(10),
});
export type SpeakingAttemptResult = z.infer<typeof speakingAttemptResultSchema>;

/** Also the body of the upload and re-score routes. */
export const speakingAttemptViewSchema = z.object({
  id: z.uuid(),
  clientAttemptId: z.uuid(),
  ordinal: z.number().int().min(1).max(3).nullable(),
  state: speakingAttemptStateSchema,
  createdAt: z.iso.datetime(),
  scoredAt: z.iso.datetime().nullable(),
  durationMs: z.number().int().positive(),
  isBest: z.boolean(),
  failure: speakingFailureSchema.nullable(),
  result: speakingAttemptResultSchema.nullable(),
});
export type SpeakingAttemptView = z.infer<typeof speakingAttemptViewSchema>;

export const speakingTargetSecondsSchema = z.object({
  min: z.number().int().positive(),
  max: z.number().int().positive(),
});
export type SpeakingTargetSeconds = z.infer<typeof speakingTargetSecondsSchema>;

export const speakingTaskViewSchema = z.object({
  shape: speakingShapeSchema,
  /** The passage — set exactly for `read_aloud`. */
  referenceText: z.string().nullable(),
  /** The question — set exactly for `open_response`. */
  prompt: z.string().nullable(),
  hint: z.string().nullable(),
  wordCount: z.number().int().positive().nullable(),
  focusTags: z.array(planTagSchema).max(3),
  targetSeconds: speakingTargetSecondsSchema.nullable(),
});
export type SpeakingTaskView = z.infer<typeof speakingTaskViewSchema>;

export const speakingLimitsSchema = z.object({
  maxAttempts: z.number().int().positive(),
  maxRecordingSeconds: z.number().int().positive(),
  minRecognizedWords: z.number().int().positive(),
});
export type SpeakingLimits = z.infer<typeof speakingLimitsSchema>;

export const speakingActivityKindSchema = z.enum(['pronunciation', 'speaking']);
export type SpeakingActivityKind = z.infer<typeof speakingActivityKindSchema>;

export const speakingRatingSchema = z.object({
  rating: difficultyRatingSchema.nullable(),
  notUseful: z.boolean(),
});
export type SpeakingRating = z.infer<typeof speakingRatingSchema>;

/** Response body of `GET /speaking/activities/:activityId`. */
export const speakingActivityViewSchema = z.object({
  activityId: z.uuid(),
  kind: speakingActivityKindSchema,
  title: z.string(),
  state: planActivityStateSchema,
  planStatus: studyPlanStatusSchema,
  estimatedMinutes: z.number().int().positive(),
  targetTags: z.array(planTagSchema).max(5),
  /** Null only for an archived activity that never had a task (A18). */
  task: speakingTaskViewSchema.nullable(),
  block: speakingBlockSchema.nullable(),
  limits: speakingLimitsSchema,
  attemptsUsed: z.number().int().min(0).max(3),
  attemptsRemaining: z.number().int().min(0).max(3),
  bestAttemptId: z.uuid().nullable(),
  /** Oldest first. `scoring`, `scored` and `failed` only — never `discarded`. */
  attempts: z.array(speakingAttemptViewSchema),
  rating: speakingRatingSchema.nullable(),
});
export type SpeakingActivityView = z.infer<typeof speakingActivityViewSchema>;

export const speakingRatingInputSchema = z.object({
  rating: difficultyRatingSchema.nullable(),
  notUseful: z.boolean(),
});
export type SpeakingRatingInput = z.infer<typeof speakingRatingInputSchema>;

export const speakingRatingViewSchema = speakingRatingSchema;
export type SpeakingRatingView = z.infer<typeof speakingRatingViewSchema>;

/** The client's idempotency key for one recording, resent unchanged on retry. */
export const SPEAKING_CLIENT_ATTEMPT_HEADER = 'X-Client-Attempt-Id';
