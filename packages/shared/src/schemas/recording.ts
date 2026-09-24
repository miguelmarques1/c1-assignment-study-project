import { z } from 'zod';

import {
  branchFailureCodeSchema,
  pipelineBranchStatusSchema,
  pipelineStageSchema,
  recordingFailureCodeSchema,
  type PipelineBranchStatus,
  type PipelineStage,
  type RecordingFailureCode,
} from './pipeline';

/**
 * The lesson-level recording contract (F07). `lessonRecordingStatusSchema`
 * covers the whole lifecycle, from before any egress starts through the
 * finalized outcome. `liveRecordingStatusSchema` is the narrower subset the
 * live classroom cares about while the lesson is still open.
 */
export const lessonRecordingStatusSchema = z.enum([
  'idle',
  'starting',
  'recording',
  'not_recording',
  'finalizing',
  'recorded',
  'recording_partial',
  'recording_failed',
  'too_short',
  'storage_unavailable',
]);
export type LessonRecordingStatus = z.infer<typeof lessonRecordingStatusSchema>;

export const liveRecordingStatusSchema = z.enum([
  'idle',
  'starting',
  'recording',
  'not_recording',
]);
export type LiveRecordingStatus = z.infer<typeof liveRecordingStatusSchema>;

/** A single participant's own recording outcome, as read from `lesson_participants`. */
export const participantRecordingStatusSchema = z.enum([
  'not_started',
  'recording',
  'stopped',
  'failed_to_start',
  'complete',
  'partial',
  'missing',
]);
export type ParticipantRecordingStatus = z.infer<typeof participantRecordingStatusSchema>;

/** The caller's own status while the lesson is still live — a subset of the above. */
export const liveParticipantRecordingStatusSchema = z.enum([
  'not_started',
  'recording',
  'stopped',
  'failed_to_start',
]);
export type LiveParticipantRecordingStatus = z.infer<typeof liveParticipantRecordingStatusSchema>;

/**
 * The branch vocabulary moved to `pipeline.ts` when F08 widened it; these
 * names stay exported from here so F07's readers keep their imports.
 */
export const pipelineBranchStageSchema = pipelineStageSchema;
export type PipelineBranchStage = PipelineStage;
export { pipelineBranchStatusSchema, recordingFailureCodeSchema };
export type { PipelineBranchStatus, RecordingFailureCode };

/** The `recording` block `GET /classroom/session` gains — lesson-wide plus the caller's own. */
export const liveRecordingSchema = z.object({
  status: liveRecordingStatusSchema,
  since: z.iso.datetime().nullable(),
  mine: z.object({
    status: liveParticipantRecordingStatusSchema,
    capturedSeconds: z.number().int(),
  }),
});
export type LiveRecording = z.infer<typeof liveRecordingSchema>;

export const pipelineBranchViewSchema = z.object({
  stage: pipelineBranchStageSchema,
  status: pipelineBranchStatusSchema,
  /** Any stage's failure code — F07's own, or a later stage's once the branch moved on. */
  failureCode: branchFailureCodeSchema.nullable(),
  failureReason: z.string().nullable(),
  retryable: z.boolean(),
  fallbackPlanRequested: z.boolean(),
});
export type PipelineBranchView = z.infer<typeof pipelineBranchViewSchema>;

/** Response body of `GET /lessons/:lessonId/recording` and the retry route — caller-scoped only. */
export const lessonRecordingViewSchema = z.object({
  lessonId: z.uuid(),
  lessonStatus: z.string(),
  endReason: z.string().nullable(),
  startedAt: z.iso.datetime().nullable(),
  endedAt: z.iso.datetime().nullable(),
  durationSeconds: z.number().int().nullable(),
  recordingStatus: lessonRecordingStatusSchema,
  storageBytes: z.number().int(),
  mine: z.object({
    recordingStatus: participantRecordingStatusSchema,
    audioBytes: z.number().int().nullable(),
    capturedSeconds: z.number().int().nullable(),
    audioDurationSeconds: z.number().int().nullable(),
    recordingStartedAt: z.iso.datetime().nullable(),
    branch: pipelineBranchViewSchema.nullable(),
  }),
});
export type LessonRecordingView = z.infer<typeof lessonRecordingViewSchema>;
