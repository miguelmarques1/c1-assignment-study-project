import { z } from 'zod';

import { correctionSegmentSchema, errorRecurrenceSchema } from './analysis';
import { planActivityStateSchema, planTagSchema } from './plan';

/**
 * The writing activity contract (F17). Every view is the caller's own: no
 * field carries another participant's task, draft, correction or score, and
 * there is no user id anywhere in the shape.
 */

export const writingTaskStatusSchema = z.enum([
  'draft',
  'correcting',
  'uncorrected',
  'correction_failed',
  'corrected',
]);
export type WritingTaskStatus = z.infer<typeof writingTaskStatusSchema>;

export const writingScoreDimensionSchema = z.enum(['grammar', 'vocabulary', 'coherence', 'task_achievement']);
export type WritingScoreDimension = z.infer<typeof writingScoreDimensionSchema>;

export const writingFailureCodeSchema = z.enum(['request_failed', 'invalid_output', 'gemini_key']);
export type WritingFailureCode = z.infer<typeof writingFailureCodeSchema>;

export const writingTaskViewSchema = z.object({
  heading: z.string(),
  statement: z.string(),
  targetTags: z.array(planTagSchema).max(2),
});
export type WritingTaskView = z.infer<typeof writingTaskViewSchema>;

export const writingDraftViewSchema = z.object({
  text: z.string(),
  revision: z.number().int().nonnegative(),
  savedAt: z.iso.datetime().nullable(),
});
export type WritingDraftView = z.infer<typeof writingDraftViewSchema>;

export const writingScoreViewSchema = z.object({
  dimension: writingScoreDimensionSchema,
  label: z.string(),
  score: z.number().int().min(0).max(100),
});
export type WritingScoreView = z.infer<typeof writingScoreViewSchema>;

export const writingHighlightSegmentSchema = z.object({
  text: z.string(),
  errorIndexes: z.array(z.number().int().nonnegative()),
});
export type WritingHighlightSegment = z.infer<typeof writingHighlightSegmentSchema>;

export const writingRevisionSegmentSchema = z.object({
  text: z.string(),
  changed: z.boolean(),
});
export type WritingRevisionSegment = z.infer<typeof writingRevisionSegmentSchema>;

export const writingErrorViewSchema = z.object({
  index: z.number().int().nonnegative(),
  quote: z.string(),
  tag: z.string(),
  tagLabel: z.string(),
  correction: z.string(),
  correctionSegments: z.array(correctionSegmentSchema),
  explanation: z.string(),
});
export type WritingErrorView = z.infer<typeof writingErrorViewSchema>;

export const writingErrorGroupViewSchema = z.object({
  tag: z.string(),
  tagLabel: z.string(),
  errorIndexes: z.array(z.number().int().nonnegative()),
  recurrence: errorRecurrenceSchema.nullable(),
});
export type WritingErrorGroupView = z.infer<typeof writingErrorGroupViewSchema>;

export const writingCorrectionViewSchema = z.object({
  correctedAt: z.iso.datetime(),
  overallComment: z.string(),
  scores: z.array(writingScoreViewSchema).length(4),
  text: z.array(writingHighlightSegmentSchema),
  revision: z.array(writingRevisionSegmentSchema),
  errors: z.array(writingErrorViewSchema),
  errorGroups: z.array(writingErrorGroupViewSchema),
});
export type WritingCorrectionView = z.infer<typeof writingCorrectionViewSchema>;

export const writingFailureViewSchema = z.object({
  code: writingFailureCodeSchema,
  message: z.string(),
});
export type WritingFailureView = z.infer<typeof writingFailureViewSchema>;

export const writingLimitViewSchema = z.object({
  max: z.number().int().positive(),
  used: z.number().int().nonnegative(),
  resetsAt: z.iso.datetime().nullable(),
});
export type WritingLimitView = z.infer<typeof writingLimitViewSchema>;

export const writingSubmissionViewSchema = z.object({
  geminiKeyUsable: z.boolean(),
  dailyLimit: writingLimitViewSchema,
});
export type WritingSubmissionView = z.infer<typeof writingSubmissionViewSchema>;

/** The body of every writing route (spec §5). */
export const writingActivityViewSchema = z.object({
  activityId: z.uuid(),
  taskId: z.uuid(),
  planId: z.uuid(),
  activityState: planActivityStateSchema,
  readOnly: z.boolean(),
  title: z.string(),
  task: writingTaskViewSchema,
  status: writingTaskStatusSchema,
  draft: writingDraftViewSchema,
  submittedAt: z.iso.datetime().nullable(),
  failure: writingFailureViewSchema.nullable(),
  correction: writingCorrectionViewSchema.nullable(),
  submission: writingSubmissionViewSchema,
  serverTime: z.iso.datetime(),
});
export type WritingActivityView = z.infer<typeof writingActivityViewSchema>;

export const saveWritingDraftSchema = z.object({
  text: z.string().max(10_000),
  baseRevision: z.number().int().nonnegative(),
  activeSecondsDelta: z.number().int().min(0).max(600).optional().default(0),
});
export type SaveWritingDraftInput = z.infer<typeof saveWritingDraftSchema>;

export const writingDraftSavedSchema = z.object({
  revision: z.number().int().nonnegative(),
  savedAt: z.iso.datetime(),
  status: z.literal('draft'),
});
export type WritingDraftSaved = z.infer<typeof writingDraftSavedSchema>;

export const submitWritingSchema = z.object({
  submissionId: z.uuid(),
  baseRevision: z.number().int().min(1),
});
export type SubmitWritingInput = z.infer<typeof submitWritingSchema>;

/** `WRIT003`'s `details`. */
export const writingLimitDetailsSchema = z.object({
  limit: z.number().int().positive(),
  used: z.number().int().nonnegative(),
  resetsAt: z.iso.datetime(),
});
export type WritingLimitDetails = z.infer<typeof writingLimitDetailsSchema>;

/** `WRIT004`'s `details`. */
export const writingDraftConflictDetailsSchema = z.object({
  draft: z.object({
    text: z.string(),
    revision: z.number().int().nonnegative(),
    savedAt: z.iso.datetime().nullable(),
  }),
});
export type WritingDraftConflictDetails = z.infer<typeof writingDraftConflictDetailsSchema>;

/** The PRD's minimum, an upper bound and a draft's storage cap (spec A19). */
export const WRITING_MIN_SUBMIT_WORDS = 80;
export const WRITING_EXPECTED_WORDS = { min: 120, max: 250 } as const;
export const WRITING_MAX_SUBMIT_WORDS = 600;
export const WRITING_DRAFT_MAX_CHARS = 10_000;
export const WRITING_TASK_WORDS = { min: 80, max: 150 } as const;
export const WRITING_DAILY_CORRECTION_LIMIT = 10;
export const WRITING_LIMIT_WINDOW_HOURS = 24;
export const WRITING_LOCAL_SAVE_INTERVAL_MS = 5_000;
export const WRITING_SERVER_SAVE_INTERVAL_MS = 30_000;
export const WRITING_POLL_INTERVAL_MS = 3_000;
export const WRITING_ACTIVE_SECONDS_MAX_DELTA = 600;

/** A run of letters or digits, which may contain one internal apostrophe or hyphen (spec A19). */
const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

/** Every token `countWords` counts, in order — the one rule TypeScript and Dart both implement. */
export function wordTokens(text: string): string[] {
  return text.match(WORD_PATTERN) ?? [];
}

export function countWords(text: string): number {
  return wordTokens(text).length;
}
