import type { CompetencySnapshotView, ProfileCompetency } from '@english-quest/shared';
import { describe, expect, it } from 'vitest';

import type { MeasurementPoint } from '../../src/profile/learning-profile.reader';
import { PROFILE_COMPETENCIES } from '../../src/profile/profile.constants';
import { buildCompetencyHistory } from '../../src/progress/competency-history';

const NOW = new Date('2026-09-28T10:00:00.000Z');

function point(competency: ProfileCompetency, overrides: Partial<MeasurementPoint> = {}): MeasurementPoint {
  return {
    competency,
    sourceKind: 'lesson',
    value: 70,
    scoreAfter: 70,
    accuracy: null,
    prosody: null,
    accuracyAfter: null,
    prosodyAfter: null,
    measuredAt: new Date('2026-09-20T18:00:00.000Z'),
    lessonId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    activityId: null,
    ...overrides,
  };
}

function snapshot(counts: Partial<Record<ProfileCompetency, number>> = {}): CompetencySnapshotView[] {
  return PROFILE_COMPETENCIES.map((competency) => ({
    competency,
    score: null,
    delta: null,
    measurementCount: counts[competency] ?? 0,
    warmingUp: (counts[competency] ?? 0) < 3,
    trend: null,
    lastMeasuredAt: null,
    subScores: null,
  }));
}

describe('buildCompetencyHistory', () => {
  it('returns_six_series_in_profile_order_even_when_empty', () => {
    const view = buildCompetencyHistory(new Map(), snapshot(), NOW);

    expect(view.series.map((series) => series.competency)).toEqual([...PROFILE_COMPETENCIES]);
    expect(view.series.every((series) => series.points.length === 0)).toBe(true);
    expect(view.pointsPerCompetency).toBe(20);
  });

  it('rounds_score_after_half_up', () => {
    const view = buildCompetencyHistory(
      new Map([['grammar', [point('grammar', { scoreAfter: 67.5 }), point('grammar', { scoreAfter: 67.49 })]]]),
      snapshot(),
      NOW,
    );

    expect(view.series[0]!.points.map((entry) => entry.score)).toEqual([68, 67]);
  });

  it('keeps_origin_ids_per_source_kind', () => {
    const activityId = '0f1e2d3c-4b5a-4968-8776-5a4b3c2d1e0f';
    const view = buildCompetencyHistory(
      new Map([
        [
          'grammar',
          [point('grammar'), point('grammar', { sourceKind: 'activity', lessonId: null, activityId })],
        ],
      ]),
      snapshot(),
      NOW,
    );

    const [lesson, activity] = view.series[0]!.points;
    expect(lesson).toMatchObject({ sourceKind: 'lesson', activityId: null });
    expect(lesson!.lessonId).not.toBeNull();
    expect(activity).toMatchObject({ sourceKind: 'activity', lessonId: null, activityId });
  });

  it('chartable_needs_one_competency_with_three_measurements', () => {
    const twos = Object.fromEntries(PROFILE_COMPETENCIES.map((competency) => [competency, 2]));

    expect(buildCompetencyHistory(new Map(), snapshot(twos), NOW).chartable).toBe(false);
    expect(buildCompetencyHistory(new Map(), snapshot({ ...twos, grammar: 3 }), NOW).chartable).toBe(true);
  });

  it('ranges_are_ninety_and_thirty_days_before_now', () => {
    const view = buildCompetencyHistory(new Map(), snapshot(), NOW);

    expect(view.ranges).toEqual([
      { range: 'all', since: null },
      { range: '90d', since: '2026-06-30T10:00:00.000Z' },
      { range: '30d', since: '2026-08-29T10:00:00.000Z' },
    ]);
  });
});
