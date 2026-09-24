import { z } from 'zod';

import { credentialProviderSchema } from './credentials';

/**
 * The post-lesson pipeline contract (F08). One branch per participant walks
 * these stages in order. F07 owns `recording`; every later stage is a row in
 * `lesson_pipeline_stages` run by the generic pipeline runner. Later features
 * widen `pipelineStageSchema` as they add their stage.
 */
export const pipelineStageSchema = z.enum([
  'recording',
  'transcription',
  'excerpt_selection',
  'pronunciation_assessment',
]);
export type PipelineStage = z.infer<typeof pipelineStageSchema>;

/** A stage row's own lifecycle — see the state diagram in the F08 spec. */
export const pipelineStageStatusSchema = z.enum([
  'queued',
  'running',
  'retrying',
  'blocked_missing_key',
  'failed',
  'completed',
]);
export type PipelineStageStatus = z.infer<typeof pipelineStageStatusSchema>;

/**
 * The branch pointer's status: F07's recording vocabulary plus the stage
 * statuses a branch can sit in while a later stage runs.
 */
export const pipelineBranchStatusSchema = z.enum([
  'verifying',
  'queued',
  'running',
  'retrying',
  'blocked_missing_key',
  'failed',
  'storage_unavailable',
]);
export type PipelineBranchStatus = z.infer<typeof pipelineBranchStatusSchema>;

/** A branch fails at the `recording` stage with exactly one of these codes (F07). */
export const recordingFailureCodeSchema = z.enum([
  'recording_failed_to_start',
  'recording_missing',
  'recording_too_short',
  'recording_assembly_failed',
]);
export type RecordingFailureCode = z.infer<typeof recordingFailureCodeSchema>;

/** Why a stage waits for its owner's key instead of failing. Resumes on its own once a usable key exists. */
export const blockedReasonCodeSchema = z.enum([
  'credential_missing',
  'credential_rejected',
  'credential_unreadable',
]);
export type BlockedReasonCode = z.infer<typeof blockedReasonCodeSchema>;

export const transcriptionFailureCodeSchema = z.enum([
  'transcription_quota_exceeded',
  'transcription_service_error',
  'transcription_storage_unreadable',
  'transcription_no_speech',
  'transcription_audio_rejected',
  'transcription_region_unsupported',
]);
export type TranscriptionFailureCode = z.infer<typeof transcriptionFailureCodeSchema>;

/** Every code a stage row can fail with. `internal_error` is the runner's own, for anything unclassified. */
export const stageFailureCodeSchema = z.enum([...transcriptionFailureCodeSchema.options, 'internal_error']);
export type StageFailureCode = z.infer<typeof stageFailureCodeSchema>;

/** Every code a branch pointer can carry while `failed`, whichever stage it failed at. */
export const branchFailureCodeSchema = z.enum([
  ...recordingFailureCodeSchema.options,
  ...stageFailureCodeSchema.options,
]);
export type BranchFailureCode = z.infer<typeof branchFailureCodeSchema>;

/**
 * Every reason code the pipeline view can show. The `recording` entry is
 * derived from F07's branch, so it adds F07's codes and its
 * `storage_unavailable` state to the stage rows' own vocabulary.
 */
export const pipelineReasonCodeSchema = z.enum([
  ...blockedReasonCodeSchema.options,
  ...branchFailureCodeSchema.options,
  'storage_unavailable',
]);
export type PipelineReasonCode = z.infer<typeof pipelineReasonCodeSchema>;

export const pipelineStageViewSchema = z.object({
  stage: pipelineStageSchema,
  status: pipelineStageStatusSchema,
  /** First attempt of the current run. Elapsed time is `serverTime − startedAt`. */
  startedAt: z.iso.datetime().nullable(),
  /** Set for `completed` and `failed`. Duration is `finishedAt − startedAt`. */
  finishedAt: z.iso.datetime().nullable(),
  lastAttemptAt: z.iso.datetime().nullable(),
  /** Set only while `retrying`. */
  nextAttemptAt: z.iso.datetime().nullable(),
  attempts: z.number().int(),
  reasonCode: pipelineReasonCodeSchema.nullable(),
  reason: z.string().nullable(),
  /** The provider's own wording, scrubbed of the key. */
  providerMessage: z.string().nullable(),
  /** The settings entry a blocked stage links to. */
  blockedProvider: credentialProviderSchema.nullable(),
  /** Whether `POST /lessons/:lessonId/pipeline/retry` would re-run it. */
  retryable: z.boolean(),
});
export type PipelineStageView = z.infer<typeof pipelineStageViewSchema>;

/** Response body of `GET /lessons/:lessonId/pipeline` and its retry — the caller's own branch only. */
export const lessonPipelineViewSchema = z.object({
  lessonId: z.uuid(),
  /** The server's clock, so a client renders elapsed time without trusting its own. */
  serverTime: z.iso.datetime(),
  branch: z
    .object({
      stage: pipelineStageSchema,
      status: pipelineBranchStatusSchema,
      stages: z.array(pipelineStageViewSchema),
    })
    .nullable(),
});
export type LessonPipelineView = z.infer<typeof lessonPipelineViewSchema>;
