import type {
  CompetencyHistoryView,
  CompetencySnapshotView,
  ProfileCompetency,
  ProgressRangeBoundary,
} from '@english-quest/shared';

import type { MeasurementPoint } from '../profile/learning-profile.reader';
import { roundScore } from '../profile/profile-fold';
import { DAY_MS, PROFILE_COMPETENCIES, WARMING_UP_BELOW_MEASUREMENTS } from '../profile/profile.constants';
import { PROGRESS_POINTS_PER_COMPETENCY, PROGRESS_RANGE_DAYS } from './progress.constants';

/** `all`, `90d`, `30d`, in that order; the server's clock is the only one both clients share. */
function rangesAt(now: Date): ProgressRangeBoundary[] {
  return [
    { range: 'all', since: null },
    { range: '90d', since: new Date(now.getTime() - PROGRESS_RANGE_DAYS['90d'] * DAY_MS).toISOString() },
    { range: '30d', since: new Date(now.getTime() - PROGRESS_RANGE_DAYS['30d'] * DAY_MS).toISOString() },
  ];
}

/**
 * The chart's data (F20), assembled from each competency's newest points.
 * Pure: always six series in the profile's order, each point the smoothed
 * score after the measurement rounded half up, so the last point of a
 * series is the snapshot score the profile route shows.
 */
export function buildCompetencyHistory(
  pointsByCompetency: ReadonlyMap<ProfileCompetency, readonly MeasurementPoint[]>,
  competencies: readonly CompetencySnapshotView[],
  now: Date,
): CompetencyHistoryView {
  return {
    pointsPerCompetency: PROGRESS_POINTS_PER_COMPETENCY,
    chartable: competencies.some((entry) => entry.measurementCount >= WARMING_UP_BELOW_MEASUREMENTS),
    ranges: rangesAt(now),
    series: PROFILE_COMPETENCIES.map((competency) => ({
      competency,
      points: (pointsByCompetency.get(competency) ?? []).map((point) => ({
        measuredAt: point.measuredAt.toISOString(),
        score: roundScore(point.scoreAfter),
        sourceKind: point.sourceKind,
        lessonId: point.lessonId,
        activityId: point.activityId,
      })),
    })),
  };
}
