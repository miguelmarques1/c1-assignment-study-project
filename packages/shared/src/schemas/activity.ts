import { z } from 'zod';

import { cefrLevelSchema, contentItemTypeSchema } from './content';
import {
  difficultyRatingSchema,
  planActivityKindSchema,
  planActivityStateSchema,
  planActivityViewSchema,
  planTagSchema,
  studyPlanStatusSchema,
} from './plan';

/**
 * F16's objective activity contract. Every view is the caller's own, and no
 * view sent before a submission carries an answer, an explanation, a
 * listening transcript or an item's source: correction happens in the API
 * (spec A3). The session and activity blocks are kind-agnostic, so the
 * writing and speaking runners can reuse them.
 */

/** The longest typed answer to a fill-in-the-blank question. */
export const OBJECTIVE_FILL_ANSWER_MAX_CHARS = 100;
/** Skip reasons share F15's bound. */
export const ACTIVITY_SKIP_REASON_MAX_CHARS = 200;
/** Active time per attempt is clamped to an hour server-side (A16). */
export const OBJECTIVE_TIME_SPENT_MAX_SECONDS = 3_600;

const isoDate = z.iso.datetime();

/** The activity itself, as placed by F15, for any kind. */
export const activityContextSchema = z.object({
  /** The resolved (newest) plan activity id. */
  id: z.uuid(),
  /** Oldest first. A client looks up drafts under each id. */
  lineage: z.array(z.uuid()).min(1),
  planId: z.uuid(),
  planStatus: studyPlanStatusSchema,
  /** True when the plan is archived: no state change is possible. */
  readOnly: z.boolean(),
  kind: planActivityKindSchema,
  title: z.string(),
  estimatedMinutes: z.number().int().positive(),
  targetTags: z.array(planTagSchema).max(5),
  rationale: z.string(),
  state: planActivityStateSchema,
  startedAt: isoDate.nullable(),
  completedAt: isoDate.nullable(),
  skippedAt: isoDate.nullable(),
  skipReason: z.string().nullable(),
  rating: difficultyRatingSchema.nullable(),
  notUseful: z.boolean(),
  planCompletionPercent: z.number().int().min(0).max(100),
});
export type ActivityContext = z.infer<typeof activityContextSchema>;

/** The day's session around the activity: its position and every entry, so a client can pass an entry to its route registry. */
export const activitySessionSchema = z.object({
  day: z.number().int().min(1).max(7),
  position: z.number().int().min(1).max(4),
  count: z.number().int().min(2).max(4),
  activities: z.array(planActivityViewSchema).min(2).max(4),
});
export type ActivitySession = z.infer<typeof activitySessionSchema>;

export const unscoredReasonSchema = z.enum(['format_unavailable', 'answer_key_invalid']);
export type UnscoredReason = z.infer<typeof unscoredReasonSchema>;

/** A question as a client sees it before submitting: never an answer, never an explanation. */
export const objectiveQuestionViewSchema = z.discriminatedUnion('format', [
  z.object({
    index: z.number().int().min(0).max(4),
    format: z.literal('multiple_choice'),
    prompt: z.string(),
    options: z.array(z.string()).length(4),
  }),
  z.object({
    index: z.number().int().min(0).max(4),
    format: z.literal('fill_blank'),
    prompt: z.string(),
    /** The text before and after the single blank marker. */
    before: z.string(),
    after: z.string(),
    /** Sized to the longest accepted answer, 4 to 40. */
    blankLength: z.number().int().min(4).max(40),
  }),
  z.object({
    index: z.number().int().min(0).max(4),
    format: z.literal('unscored'),
    prompt: z.string().nullable(),
    reason: unscoredReasonSchema,
  }),
]);
export type ObjectiveQuestionView = z.infer<typeof objectiveQuestionViewSchema>;

/** `transcript` is a listening item's body, present only once submitted. */
export const objectivePassageSchema = z.object({
  kind: z.enum(['text', 'transcript']),
  text: z.string(),
});
export type ObjectivePassage = z.infer<typeof objectivePassageSchema>;

export const objectiveItemViewSchema = z.object({
  type: contentItemTypeSchema,
  title: z.string(),
  topic: z.string(),
  cefrLevel: cefrLevelSchema,
  accent: z.string().nullable(),
  durationSeconds: z.number().int().nullable(),
  passage: objectivePassageSchema.nullable(),
  hasAudio: z.boolean(),
  /** Only once submitted: a curated source usually links to the original with its transcript. */
  source: z.object({ name: z.string(), url: z.string().nullable() }).nullable(),
  /** SHA-256 hex of the attempt's question snapshot, or of the live item when there is no attempt yet. */
  questionsFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  questions: z.array(objectiveQuestionViewSchema).length(5),
});
export type ObjectiveItemView = z.infer<typeof objectiveItemViewSchema>;

export const objectiveAttemptStatusSchema = z.enum(['open', 'submitted']);
export type ObjectiveAttemptStatus = z.infer<typeof objectiveAttemptStatusSchema>;

export const objectiveAttemptViewSchema = z.object({
  id: z.uuid(),
  status: objectiveAttemptStatusSchema,
  startedAt: isoDate,
  submittedAt: isoDate.nullable(),
});
export type ObjectiveAttemptView = z.infer<typeof objectiveAttemptViewSchema>;

export const objectiveResultQuestionSchema = z.object({
  index: z.number().int().min(0).max(4),
  format: z.enum(['multiple_choice', 'fill_blank', 'unscored']),
  prompt: z.string().nullable(),
  outcome: z.enum(['correct', 'incorrect', 'unscored']),
  /** The chosen option's text or the typed text. */
  response: z.string().nullable(),
  /** The correct option, or the first accepted variant. */
  correctAnswer: z.string().nullable(),
  /** Empty except for fill-in-the-blank. */
  acceptedAnswers: z.array(z.string()),
  explanation: z.string().nullable(),
  unscoredReason: unscoredReasonSchema.nullable(),
});
export type ObjectiveResultQuestion = z.infer<typeof objectiveResultQuestionSchema>;

export const objectiveResultSchema = z.object({
  scoreCorrect: z.number().int().min(0).max(5),
  /** Scored questions only. */
  scoreTotal: z.number().int().min(1).max(5),
  unscoredCount: z.number().int().min(0).max(5),
  timeSpentSeconds: z.number().int().min(0).nullable(),
  submittedAt: isoDate,
  questions: z.array(objectiveResultQuestionSchema).length(5),
});
export type ObjectiveResult = z.infer<typeof objectiveResultSchema>;

/** Null for `writing`, `speaking` and `pronunciation` activities. */
export const objectiveViewSchema = z.object({
  /** False when no question can be corrected. */
  runnable: z.boolean(),
  item: objectiveItemViewSchema,
  attempt: objectiveAttemptViewSchema.nullable(),
  result: objectiveResultSchema.nullable(),
});
export type ObjectiveView = z.infer<typeof objectiveViewSchema>;

/** Body of `GET /activities/:activityId` and what start and submit answer with. */
export const activityViewSchema = z.object({
  serverTime: isoDate,
  activity: activityContextSchema,
  session: activitySessionSchema,
  objective: objectiveViewSchema.nullable(),
});
export type ActivityView = z.infer<typeof activityViewSchema>;

/** One answer, by the question's own format. */
export const objectiveAnswerSchema = z.discriminatedUnion('format', [
  z.object({
    index: z.number().int().min(0).max(4),
    format: z.literal('multiple_choice'),
    optionIndex: z.number().int().min(0).max(3),
  }),
  z.object({
    index: z.number().int().min(0).max(4),
    format: z.literal('fill_blank'),
    text: z.string().trim().min(1).max(OBJECTIVE_FILL_ANSWER_MAX_CHARS),
  }),
]);
export type ObjectiveAnswer = z.infer<typeof objectiveAnswerSchema>;

export const objectiveSubmissionInputSchema = z.object({
  questionsFingerprint: z.string().regex(/^[0-9a-f]{64}$/, 'must be 64 hex characters'),
  /** Active seconds; values above an hour are clamped, not rejected. */
  timeSpentSeconds: z.number().int().min(0),
  answers: z.array(objectiveAnswerSchema).max(5),
});
export type ObjectiveSubmissionInput = z.infer<typeof objectiveSubmissionInputSchema>;

export const activitySkipInputSchema = z.object({
  reason: z.string().trim().min(1).max(ACTIVITY_SKIP_REASON_MAX_CHARS),
});
export type ActivitySkipInput = z.infer<typeof activitySkipInputSchema>;

/** A null rating with `notUseful: true` records only the flag. */
export const activityRatingInputSchema = z.object({
  rating: difficultyRatingSchema.nullable(),
  notUseful: z.boolean(),
});
export type ActivityRatingInput = z.infer<typeof activityRatingInputSchema>;

export const activityRatingViewSchema = z.object({
  rating: difficultyRatingSchema.nullable(),
  notUseful: z.boolean(),
  ratedAt: isoDate,
});
export type ActivityRatingView = z.infer<typeof activityRatingViewSchema>;
