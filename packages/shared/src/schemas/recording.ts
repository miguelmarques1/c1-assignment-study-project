import { z } from 'zod';

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

export const pipelineBranchStageSchema = z.enum(['recording', 'transcription']);
export type PipelineBranchStage = z.infer<typeof pipelineBranchStageSchema>;

export const pipelineBranchStatusSchema = z.enum([
  'verifying',
  'queued',
  'failed',
  'storage_unavailable',
]);
export type PipelineBranchStatus = z.infer<typeof pipelineBranchStatusSchema>;

/** A branch fails at the `recording` stage with exactly one of these codes. */
export const recordingFailureCodeSchema = z.enum([
  'recording_failed_to_start',
  'recording_missing',
  'recording_too_short',
  'recording_assembly_failed',
]);
export type RecordingFailureCode = z.infer<typeof recordingFailureCodeSchema>;

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
  failureCode: recordingFailureCodeSchema.nullable(),
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
