import { z } from 'zod';

/**
 * The study plan contract (F15). Every view is the caller's own: no field
 * carries another participant's plan, activity, rationale or tag, and there
 * is no user id anywhere in the shape. Internal-only fields the composer
 * records for the curator (composition mode, the prompt stamp, the model's
 * selection statistics, the rules version) never reach a client — F13's
 * precedent for content items applies here too.
 */

/** The five bank-backed kinds F13 already knows, plus the three task kinds F15 places with no content item. */
export const planActivityKindSchema = z.enum([
  'listening',
  'reading',
  'vocabulary',
  'grammar',
  'error_review',
  'writing',
  'speaking',
  'pronunciation',
]);
export type PlanActivityKind = z.infer<typeof planActivityKindSchema>;

export const planActivityStateSchema = z.enum(['pending', 'in_progress', 'completed', 'skipped']);
export type PlanActivityState = z.infer<typeof planActivityStateSchema>;

export const planSessionStateSchema = z.enum(['not_started', 'in_progress', 'completed']);
export type PlanSessionState = z.infer<typeof planSessionStateSchema>;

export const studyPlanStatusSchema = z.enum(['active', 'archived']);
export type StudyPlanStatus = z.infer<typeof studyPlanStatusSchema>;

/** `lesson` is the full pipeline; the other two are F15's own request paths. */
export const studyPlanOriginSchema = z.enum(['lesson', 'recording_failed', 'analysis_blocked']);
export type StudyPlanOrigin = z.infer<typeof studyPlanOriginSchema>;

export const difficultyRatingSchema = z.enum(['too_easy', 'just_right', 'too_hard']);
export type DifficultyRating = z.infer<typeof difficultyRatingSchema>;

/** Server-built sentences, fixed order (spec §5 "Notes"). */
export const planNoteCodeSchema = z.enum([
  'recording_failed',
  'gemini_key_missing',
  'gemini_quota_exhausted',
  'general_material',
  'missing_listening',
  'missing_reading',
]);
export type PlanNoteCode = z.infer<typeof planNoteCodeSchema>;

export const planNoteSchema = z.object({
  code: planNoteCodeSchema,
  text: z.string(),
});
export type PlanNote = z.infer<typeof planNoteSchema>;

/** An error-taxonomy tag with its human-readable label, reused for an activity's targets and a plan's focus tags. */
export const planTagSchema = z.object({
  tag: z.string(),
  label: z.string(),
});
export type PlanTag = z.infer<typeof planTagSchema>;

export const planRatingCountsSchema = z.object({
  tooEasy: z.number().int().nonnegative(),
  justRight: z.number().int().nonnegative(),
  tooHard: z.number().int().nonnegative(),
  notUseful: z.number().int().nonnegative(),
});
export type PlanRatingCounts = z.infer<typeof planRatingCountsSchema>;

export const planProgressSchema = z.object({
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  inProgress: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  /** `floor(100 * completed / total)`; 0 for an empty plan. */
  completionPercent: z.number().int().min(0).max(100),
});
export type PlanProgress = z.infer<typeof planProgressSchema>;

export const planActivityViewSchema = z.object({
  id: z.uuid(),
  day: z.number().int().min(1).max(7),
  position: z.number().int().min(1).max(4),
  kind: planActivityKindSchema,
  /** Null exactly for `writing`, `speaking` and `pronunciation`. */
  contentItemId: z.uuid().nullable(),
  title: z.string(),
  /** Computed in code from item metadata or the rules file, never from the model. */
  estimatedMinutes: z.number().int().positive(),
  targetTags: z.array(planTagSchema).max(5),
  rationale: z.string(),
  isReview: z.boolean(),
  /** True when this activity carried over from the previous plan. */
  carriedOver: z.boolean(),
  state: planActivityStateSchema,
  startedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  skippedAt: z.iso.datetime().nullable(),
  skipReason: z.string().nullable(),
  rating: difficultyRatingSchema.nullable(),
  notUseful: z.boolean(),
});
export type PlanActivityView = z.infer<typeof planActivityViewSchema>;

export const planSessionSummarySchema = z.object({
  completed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  /** Null when nothing in the session carries a score (e.g. only writing or speaking so far). */
  correct: z.number().int().nonnegative().nullable(),
  questions: z.number().int().nonnegative().nullable(),
  timeSpentSeconds: z.number().int().nonnegative().nullable(),
});
export type PlanSessionSummary = z.infer<typeof planSessionSummarySchema>;

export const planSessionViewSchema = z.object({
  day: z.number().int().min(1).max(7),
  /** Sum of its activities' `estimatedMinutes`. */
  estimatedMinutes: z.number().int().positive(),
  state: planSessionStateSchema,
  completedAt: z.iso.datetime().nullable(),
  summary: planSessionSummarySchema,
  activities: z.array(planActivityViewSchema).min(2).max(4),
});
export type PlanSessionView = z.infer<typeof planSessionViewSchema>;

/** The full shape of one plan — the body of `GET /plans/:planId` and the `plan` field of `GET /plans/current`. */
export const studyPlanViewSchema = z.object({
  id: z.uuid(),
  status: studyPlanStatusSchema,
  origin: studyPlanOriginSchema,
  lessonId: z.uuid(),
  /** The lesson's `started_at`, falling back to `opened_at`. */
  lessonDate: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  /** Null for a plan archived on arrival (superseded before ever being shown). */
  activatedAt: z.iso.datetime().nullable(),
  archivedAt: z.iso.datetime().nullable(),
  summaryLine: z.string(),
  focusTags: z.array(planTagSchema).max(3),
  notes: z.array(planNoteSchema),
  progress: planProgressSchema,
  ratings: planRatingCountsSchema,
  /** Always 7, ordered by `day`. */
  sessions: z.array(planSessionViewSchema).length(7),
});
export type StudyPlanView = z.infer<typeof studyPlanViewSchema>;

/** A build that will replace (or create) the caller's active plan is in progress. */
export const planPreparingSchema = z.object({
  lessonId: z.uuid(),
  origin: studyPlanOriginSchema,
  /** When the build became visible: analysis completed, or the request was created. */
  since: z.iso.datetime(),
  /** F14's settled slots over planned slots, while generation runs; null otherwise. */
  progress: z
    .object({
      done: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    })
    .nullable(),
});
export type PlanPreparing = z.infer<typeof planPreparingSchema>;

/** The newest build that outranks the active plan failed. */
export const planFailureSchema = z.object({
  lessonId: z.uuid(),
  origin: studyPlanOriginSchema,
  failedAt: z.iso.datetime(),
  message: z.string(),
  /** Always true in this version; reserved for a future non-retryable state. */
  retryable: z.boolean(),
});
export type PlanFailure = z.infer<typeof planFailureSchema>;

/** Response body of `GET /plans/current`. */
export const currentPlanViewSchema = z.object({
  serverTime: z.iso.datetime(),
  plan: studyPlanViewSchema.nullable(),
  preparing: planPreparingSchema.nullable(),
  /** Null while `preparing` is set. */
  failure: planFailureSchema.nullable(),
});
export type CurrentPlanView = z.infer<typeof currentPlanViewSchema>;

export const planHistoryItemSchema = z.object({
  id: z.uuid(),
  status: studyPlanStatusSchema,
  origin: studyPlanOriginSchema,
  lessonId: z.uuid(),
  lessonDate: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  activatedAt: z.iso.datetime().nullable(),
  archivedAt: z.iso.datetime().nullable(),
  summaryLine: z.string(),
  activityCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  completionPercent: z.number().int().min(0).max(100),
  ratings: planRatingCountsSchema,
});
export type PlanHistoryItem = z.infer<typeof planHistoryItemSchema>;

/** Response body of `GET /plans` — up to the 100 newest, active and archived. */
export const planHistoryViewSchema = z.object({
  plans: z.array(planHistoryItemSchema),
});
export type PlanHistoryView = z.infer<typeof planHistoryViewSchema>;
