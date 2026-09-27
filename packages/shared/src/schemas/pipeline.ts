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
  'lesson_analysis',
  'profile_update',
  'plan_generation',
]);
export type PipelineStage = z.infer<typeof pipelineStageSchema>;

/**
 * How each stage reads in a stepper (F19): `title` once it has happened,
 * `active` while it runs. A `Record`, so no stage can be added without its
 * labels. The mobile client mirrors this table by hand.
 */
export const pipelineStageLabels: Record<PipelineStage, { title: string; active: string }> = {
  recording: { title: 'Recorded', active: 'Recording' },
  transcription: { title: 'Transcribed', active: 'Transcribing' },
  excerpt_selection: { title: 'Excerpts selected', active: 'Selecting excerpts' },
  pronunciation_assessment: { title: 'Pronunciation assessed', active: 'Assessing pronunciation' },
  lesson_analysis: { title: 'Analyzed', active: 'Analyzing' },
  profile_update: { title: 'Profile updated', active: 'Updating profile' },
  plan_generation: { title: 'Plan generated', active: 'Generating plan' },
};

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
 * The branch pointer's status: F07's recording vocabulary, the stage
 * statuses a branch can sit in while a later stage runs, and `completed`
 * once its last stage (`plan_generation`, F15) finishes.
 */
export const pipelineBranchStatusSchema = z.enum([
  'verifying',
  'queued',
  'running',
  'retrying',
  'blocked_missing_key',
  'failed',
  'storage_unavailable',
  'completed',
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

export const pronunciationFailureCodeSchema = z.enum([
  'pronunciation_too_few_assessed',
  'pronunciation_quota_exhausted',
  'pronunciation_audio_unprocessable',
  'pronunciation_storage_unreadable',
  'pronunciation_region_unsupported',
]);
export type PronunciationFailureCode = z.infer<typeof pronunciationFailureCodeSchema>;

export const analysisFailureCodeSchema = z.enum([
  'analysis_quota_exceeded',
  'analysis_timeout',
  'analysis_service_error',
  'analysis_invalid_output',
  'analysis_request_rejected',
]);
export type AnalysisFailureCode = z.infer<typeof analysisFailureCodeSchema>;

/** Every code a stage row can fail with. `internal_error` is the runner's own, for anything unclassified. */
export const stageFailureCodeSchema = z.enum([
  ...transcriptionFailureCodeSchema.options,
  ...pronunciationFailureCodeSchema.options,
  ...analysisFailureCodeSchema.options,
  'internal_error',
]);
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
  /** Settled units of work vs. the run's total. `null` for stages that never report progress. */
  progress: z
    .object({
      done: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    })
    .nullable(),
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
