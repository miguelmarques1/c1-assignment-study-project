import { z } from 'zod';

/**
 * The live-session lifecycle only. A lesson whose recording failed is a
 * separate fact recorded by F07 on its own column — `ended` here says
 * nothing about whether anything was captured.
 */
export const lessonStatusSchema = z.enum([
  'waiting',
  'live',
  'ended',
  'ended_unexpectedly',
  'abandoned',
]);
export type LessonStatus = z.infer<typeof lessonStatusSchema>;

export const lessonEndReasonSchema = z.enum([
  'ended_by_participant',
  'all_disconnected',
  'max_duration',
  'abandoned_before_start',
]);
export type LessonEndReason = z.infer<typeof lessonEndReasonSchema>;

/** Response body of `POST /classroom/token`. */
export const classroomTokenSchema = z.object({
  lessonId: z.uuid(),
  roomName: z.string(),
  url: z.string(),
  token: z.string(),
  identity: z.string(),
  expiresAt: z.iso.datetime(),
  maxParticipants: z.number().int(),
  status: lessonStatusSchema,
});
export type ClassroomToken = z.infer<typeof classroomTokenSchema>;

export const classroomParticipantSchema = z.object({
  userId: z.uuid(),
  displayName: z.string(),
  connected: z.boolean(),
  joinedAt: z.iso.datetime(),
});
export type ClassroomParticipant = z.infer<typeof classroomParticipantSchema>;

export const classroomAwaitingSchema = z.object({
  userId: z.uuid(),
  displayName: z.string(),
});
export type ClassroomAwaiting = z.infer<typeof classroomAwaitingSchema>;

/** Response body of `GET /classroom/session`. `null` when nothing is open. */
export const classroomSessionSchema = z
  .object({
    lessonId: z.uuid(),
    status: lessonStatusSchema,
    openedBy: z.uuid(),
    startedAt: z.iso.datetime().nullable(),
    maxParticipants: z.number().int(),
    participants: z.array(classroomParticipantSchema),
    awaiting: z.array(classroomAwaitingSchema),
  })
  .nullable();
export type ClassroomSession = z.infer<typeof classroomSessionSchema>;

/** Response body of `POST /classroom/:lessonId/end`. */
export const classroomEndResultSchema = z.object({
  lessonId: z.uuid(),
  status: lessonStatusSchema,
  endedAt: z.iso.datetime(),
  durationSeconds: z.number().int().nullable(),
});
export type ClassroomEndResult = z.infer<typeof classroomEndResultSchema>;
