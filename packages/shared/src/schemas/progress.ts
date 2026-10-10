import { z } from 'zod';

import { learningProfileViewSchema, profileCompetencySchema } from './profile';

/**
 * The progress dashboard contract (F20). One caller-scoped view: the exact
 * learning-profile view `GET /profile` returns, plus the history behind the
 * competency chart. No field can carry another participant's data, and there
 * is no user id anywhere in the shape.
 */

/** The chart's range selector; the server owns each range's boundary. */
export const progressRangeSchema = z.enum(['all', '90d', '30d']);
export type ProgressRange = z.infer<typeof progressRangeSchema>;

export const progressRangeBoundarySchema = z.object({
  range: progressRangeSchema,
  /** Points with `measuredAt` on or after this instant are in range; null keeps every point. */
  since: z.iso.datetime().nullable(),
});
export type ProgressRangeBoundary = z.infer<typeof progressRangeBoundarySchema>;

/** Lesson points are drawn as filled circles, activity points as hollow diamonds. */
export const measurementSourceKindSchema = z.enum(['lesson', 'activity']);
export type MeasurementSourceKind = z.infer<typeof measurementSourceKindSchema>;

export const competencyHistoryPointSchema = z.object({
  /** Lesson start (lessons) or activity completion (activities). */
  measuredAt: z.iso.datetime(),
  /** The smoothed score after this measurement, rounded half up: the last point is the snapshot score. */
  score: z.number().int().min(0).max(100),
  sourceKind: measurementSourceKindSchema,
  /** Set for a lesson point: a lesson the caller took part in. */
  lessonId: z.uuid().nullable(),
  /** Set for an activity point: the caller's own activity. */
  activityId: z.uuid().nullable(),
});
export type CompetencyHistoryPoint = z.infer<typeof competencyHistoryPointSchema>;

export const competencyHistorySeriesSchema = z.object({
  competency: profileCompetencySchema,
  /** The competency's newest measurements, oldest first. */
  points: z.array(competencyHistoryPointSchema).max(20),
});
export type CompetencyHistorySeries = z.infer<typeof competencyHistorySeriesSchema>;

export const competencyHistoryViewSchema = z.object({
  /** Always 20: the cap the chart caption states. */
  pointsPerCompetency: z.number().int().positive(),
  /** At least one competency has 3 or more measurements. False: the chart shows its explanatory empty state. */
  chartable: z.boolean(),
  /** `all`, `90d`, `30d`, in that order. */
  ranges: z.array(progressRangeBoundarySchema).length(3),
  /** Always six, in the learning profile's competency order, possibly with no points. */
  series: z.array(competencyHistorySeriesSchema).length(6),
});
export type CompetencyHistoryView = z.infer<typeof competencyHistoryViewSchema>;

/** Response body of `GET /progress` — the caller's own data only. */
export const progressDashboardViewSchema = z.object({
  /** The instant the view was built; `profile.serverTime` carries the same value. */
  serverTime: z.iso.datetime(),
  profile: learningProfileViewSchema,
  competencyHistory: competencyHistoryViewSchema,
});
export type ProgressDashboardView = z.infer<typeof progressDashboardViewSchema>;
