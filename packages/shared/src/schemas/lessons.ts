import { z } from 'zod';

import { pipelineStageSchema } from './pipeline';
import { lessonScenarioStatusSchema, roleCardStatusSchema, vocabularyDomainSchema } from './scenario';

/**
 * The lesson history contract (F19). A row's status is the caller's own,
 * derived at read time from the lesson's recording status and the caller's
 * pipeline branch — never stored, and never changed by another participant's
 * progress. Exactly one status per row; flags sit beside it.
 */
export const lessonHistoryStatusSchema = z.enum([
  'processing',
  'ready',
  'blocked',
  'failed',
  'too_short',
  'recording_failed',
]);
export type LessonHistoryStatus = z.infer<typeof lessonHistoryStatusSchema>;

/** Descriptive markers that co-occur with any status, so none can hide the actionable one. */
export const lessonHistoryFlagSchema = z.enum(['partial', 'no_scenario', 'ended_unexpectedly']);
export type LessonHistoryFlag = z.infer<typeof lessonHistoryFlagSchema>;

export const lessonHistoryStatusLabels: Record<LessonHistoryStatus, string> = {
  processing: 'Processing',
  ready: 'Ready',
  blocked: 'Blocked',
  failed: 'Failed',
  too_short: 'Too short',
  recording_failed: 'Recording failed',
};

export const lessonHistoryFlagLabels: Record<LessonHistoryFlag, string> = {
  partial: 'Partial',
  no_scenario: 'No scenario',
  ended_unexpectedly: 'Ended unexpectedly',
};

/** Names only: nothing a participant row carries is private. */
export const lessonParticipantSummarySchema = z.object({
  userId: z.uuid(),
  displayName: z.string(),
  isMe: z.boolean(),
});
export type LessonParticipantSummary = z.infer<typeof lessonParticipantSummarySchema>;

/** One row of `GET /lessons`, and the header of `GET /lessons/:lessonId`. */
export const lessonSummarySchema = z.object({
  lessonId: z.uuid(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  durationSeconds: z.number().int().nullable(),
  participants: z.array(lessonParticipantSummarySchema),
  /** The situation's title while it is `ready`; null otherwise. */
  scenarioTitle: z.string().nullable(),
  /** Exactly `lesson_scenarios.vocabulary_domain` for a `ready` situation, null otherwise — what F20 counts. */
  vocabularyDomain: vocabularyDomainSchema.nullable(),
  status: lessonHistoryStatusSchema,
  flags: z.array(lessonHistoryFlagSchema),
  /** The caller's own stage for `processing`, `blocked` and `failed`. */
  activeStage: pipelineStageSchema.nullable(),
  /** Server-built sentence for `blocked`, `failed`, `too_short` and `recording_failed`. */
  statusReason: z.string().nullable(),
  /** Only for `ready`: the caller's own largest changes, e.g. `Grammar +4 · Pronunciation −2`. */
  headline: z.string().nullable(),
  /** Every participant's verified audio together, with no individual breakdown (F07). */
  storageBytes: z.number().int().nonnegative(),
});
export type LessonSummary = z.infer<typeof lessonSummarySchema>;

/** Response body of `GET /lessons`: newest first, keyset-paginated. */
export const lessonListSchema = z.object({
  lessons: z.array(lessonSummarySchema),
  /** Null on the last page. */
  nextCursor: z.string().nullable(),
  /** Across every lesson the caller would see in the list, not just this page. */
  totalStorageBytes: z.number().int().nonnegative(),
});
export type LessonList = z.infer<typeof lessonListSchema>;

export const LESSON_LIST_DEFAULT_LIMIT = 20;
export const LESSON_LIST_MAX_LIMIT = 50;

/** Query of `GET /lessons`. The cursor is opaque; the service decodes it. */
export const lessonListQuerySchema = z.object({
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(LESSON_LIST_MAX_LIMIT)
    .default(LESSON_LIST_DEFAULT_LIMIT),
});
export type LessonListQuery = z.infer<typeof lessonListQuerySchema>;

/**
 * Another participant's stage, coarse on purpose: a blocked stage reads
 * `pending` and a failed one `unavailable`, because the reason, the key state
 * and the retry are theirs (F08's transcript-speaker precedent).
 */
export const participantStageStateSchema = z.enum(['not_started', 'pending', 'completed', 'unavailable']);
export type ParticipantStageState = z.infer<typeof participantStageStateSchema>;

/** There is deliberately no field here for a reason, provider message, progress or retry. */
export const otherParticipantStageSchema = z.object({
  stage: pipelineStageSchema,
  state: participantStageStateSchema,
  /** Set only for `completed`. */
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
});
export type OtherParticipantStage = z.infer<typeof otherParticipantStageSchema>;

export const otherParticipantProcessingSchema = z.object({
  userId: z.uuid(),
  displayName: z.string(),
  stages: z.array(otherParticipantStageSchema),
});
export type OtherParticipantProcessing = z.infer<typeof otherParticipantProcessingSchema>;

/** The scenario step of the caller's stepper. Never another participant's card status. */
export const lessonScenarioStepSchema = z.object({
  status: lessonScenarioStatusSchema,
  myCardStatus: roleCardStatusSchema.nullable(),
});
export type LessonScenarioStep = z.infer<typeof lessonScenarioStepSchema>;

/** Response body of `GET /lessons/:lessonId`: the summary plus the processing overview. */
export const lessonDetailViewSchema = lessonSummarySchema.extend({
  scenario: lessonScenarioStepSchema,
  /** Every other participant with a participant row, in join order. */
  others: z.array(otherParticipantProcessingSchema),
});
export type LessonDetailView = z.infer<typeof lessonDetailViewSchema>;
