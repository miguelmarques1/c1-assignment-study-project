import type { CompetencyHistoryPoint, CompetencyHistorySeries, ProfileCompetency } from '@english-quest/shared';
import { describe, expect, it } from 'vitest';

import {
  CHART_COMPETENCIES,
  chartDomain,
  chartSummary,
  drawsLine,
  markerFor,
  momentsOf,
  nearestMoment,
  plotRect,
  pointsInRange,
  seriesInRange,
  seriesRole,
  showAll,
  timeTicks,
  toggleCompetency,
  xOf,
  yOf,
} from '@/lib/progress-chart';

// The same cases run in the Dart twin (progress_chart_model_test.dart), by the same names.
const SERVER_TIME = '2026-09-28T10:00:00.000Z';
const SINCE_90 = '2026-06-30T10:00:00.000Z';
const LESSON = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const ACTIVITY = '0f1e2d3c-4b5a-4968-8776-5a4b3c2d1e0f';
const at = (value: string) => Date.parse(value);

function lessonPoint(measuredAt: string, score = 70): CompetencyHistoryPoint {
  return { measuredAt, score, sourceKind: 'lesson', lessonId: LESSON, activityId: null };
}

function activityPoint(measuredAt: string, score = 70): CompetencyHistoryPoint {
  return { measuredAt, score, sourceKind: 'activity', lessonId: null, activityId: ACTIVITY };
}

function series(competency: ProfileCompetency, points: CompetencyHistoryPoint[]): CompetencyHistorySeries {
  return { competency, points };
}

const PLOT = plotRect(640, 320);

describe('progress chart model', () => {
  it('points_in_range_keeps_measurements_on_or_after_since', () => {
    const points = [
      lessonPoint('2026-06-30T09:59:59.000Z'),
      lessonPoint('2026-06-30T10:00:00.000Z'),
      lessonPoint('2026-07-01T10:00:00.000Z'),
    ];

    expect(pointsInRange(points, SINCE_90).map((point) => point.measuredAt)).toEqual([
      '2026-06-30T10:00:00.000Z',
      '2026-07-01T10:00:00.000Z',
    ]);
  });

  it('all_time_keeps_every_returned_point', () => {
    const points = [lessonPoint('2025-01-01T10:00:00.000Z'), lessonPoint('2026-07-01T10:00:00.000Z')];

    expect(pointsInRange(points, null)).toEqual(points);
  });

  it('domain_runs_from_since_to_server_time', () => {
    const inRange = seriesInRange([series('grammar', [lessonPoint('2026-07-14T18:00:00.000Z')])], SINCE_90);

    expect(chartDomain(inRange, SINCE_90, SERVER_TIME)).toEqual({ from: at(SINCE_90), to: at(SERVER_TIME) });
  });

  it('all_time_domain_starts_at_the_earliest_point', () => {
    const inRange = seriesInRange(
      [
        series('grammar', [lessonPoint('2026-08-20T18:00:00.000Z')]),
        series('pronunciation', [lessonPoint('2026-07-14T18:00:00.000Z')]),
      ],
      null,
    );

    expect(chartDomain(inRange, null, SERVER_TIME)).toEqual({ from: at('2026-07-14T18:00:00.000Z'), to: at(SERVER_TIME) });
  });

  it('domain_ignores_visibility', () => {
    const all = [
      series('grammar', [lessonPoint('2026-08-20T18:00:00.000Z')]),
      series('pronunciation', [lessonPoint('2026-07-14T18:00:00.000Z')]),
    ];
    const domain = chartDomain(seriesInRange(all, null), null, SERVER_TIME);

    // Moments honour the visible set; the domain never takes it.
    expect(momentsOf(seriesInRange(all, null), ['grammar']).map((moment) => moment.measuredAt)).toEqual([
      '2026-08-20T18:00:00.000Z',
    ]);
    expect(domain!.from).toBe(at('2026-07-14T18:00:00.000Z'));
  });

  it('no_point_in_range_gives_no_domain', () => {
    const inRange = seriesInRange([series('grammar', [lessonPoint('2026-06-01T18:00:00.000Z')])], '2026-08-29T10:00:00.000Z');

    expect(chartDomain(inRange, '2026-08-29T10:00:00.000Z', SERVER_TIME)).toBeNull();
  });

  it('a_single_instant_domain_centres_its_points', () => {
    const domain = { from: at(SERVER_TIME), to: at(SERVER_TIME) };

    expect(xOf(at(SERVER_TIME), domain, PLOT)).toBe(PLOT.left + PLOT.width / 2);
  });

  it('x_and_y_are_linear_with_the_axis_ends_on_the_plot_edges', () => {
    const domain = { from: 0, to: 1000 };

    expect(xOf(0, domain, PLOT)).toBe(PLOT.left);
    expect(xOf(500, domain, PLOT)).toBe(PLOT.left + PLOT.width / 2);
    expect(xOf(1000, domain, PLOT)).toBe(PLOT.left + PLOT.width);
    expect(yOf(100, PLOT)).toBe(PLOT.top);
    expect(yOf(0, PLOT)).toBe(PLOT.top + PLOT.height);
    expect(yOf(50, PLOT)).toBe(PLOT.top + PLOT.height / 2);
  });

  it('ticks_are_three_below_480_and_five_at_or_above', () => {
    const domain = { from: 0, to: 4000 };

    expect(timeTicks(domain, 479)).toEqual([0, 2000, 4000]);
    expect(timeTicks(domain, 480)).toEqual([0, 1000, 2000, 3000, 4000]);
  });

  it('warming_up_series_draw_markers_only', () => {
    expect(drawsLine(2, true)).toBe(false);
    expect(drawsLine(2, false)).toBe(true);
    expect(drawsLine(1, false)).toBe(false);
  });

  it('markers_follow_the_source_kind', () => {
    expect(markerFor('lesson')).toBe('circle');
    expect(markerFor('activity')).toBe('diamond');
  });

  it('series_roles_follow_the_profile_order', () => {
    expect(CHART_COMPETENCIES.map((competency) => seriesRole(competency))).toEqual([
      'chart-1',
      'chart-2',
      'chart-3',
      'chart-4',
      'chart-5',
      'chart-6',
    ]);
    expect(seriesRole('grammar')).toBe('chart-1');
    expect(seriesRole('pronunciation')).toBe('chart-6');
  });

  it('moments_group_by_time_and_source', () => {
    const lessonAt = '2026-09-24T18:00:00.000Z';
    const activityAt = '2026-09-25T18:30:00.000Z';
    const all = CHART_COMPETENCIES.map((competency, index) =>
      series(competency, [
        lessonPoint(lessonAt, 60 + index),
        ...(competency === 'grammar' || competency === 'vocabulary' ? [activityPoint(activityAt, 80 + index)] : []),
      ]),
    );

    const moments = momentsOf(all, showAll());

    expect(moments).toHaveLength(2);
    expect(moments[0]).toMatchObject({ measuredAt: lessonAt, sourceKind: 'lesson', lessonId: LESSON });
    expect(moments[0]!.entries.map((entry) => entry.competency)).toEqual([...CHART_COMPETENCIES]);
    expect(moments[1]).toMatchObject({ measuredAt: activityAt, sourceKind: 'activity', activityId: ACTIVITY });
    expect(moments[1]!.entries.map((entry) => entry.score)).toEqual([80, 81]);
  });

  it('moments_list_only_visible_competencies', () => {
    const all = CHART_COMPETENCIES.map((competency) => series(competency, [lessonPoint('2026-09-24T18:00:00.000Z')]));

    const moments = momentsOf(all, CHART_COMPETENCIES.filter((competency) => competency !== 'grammar'));

    expect(moments).toHaveLength(1);
    expect(moments.flatMap((moment) => moment.entries.map((entry) => entry.competency))).not.toContain('grammar');
  });

  it('a_lesson_sorts_before_an_activity_at_the_same_instant', () => {
    const same = '2026-09-24T18:00:00.000Z';
    const moments = momentsOf([series('grammar', [activityPoint(same), lessonPoint(same)])], showAll());

    expect(moments.map((moment) => moment.sourceKind)).toEqual(['lesson', 'activity']);
  });

  it('nearest_moment_prefers_the_earlier_on_a_tie', () => {
    const moments = momentsOf(
      [series('grammar', [lessonPoint('2026-09-10T00:00:00.000Z'), lessonPoint('2026-09-12T00:00:00.000Z')])],
      showAll(),
    );

    expect(nearestMoment(moments, at('2026-09-11T00:00:00.000Z'))!.measuredAt).toBe('2026-09-10T00:00:00.000Z');
    expect(nearestMoment(moments, at('2026-09-11T12:00:00.000Z'))!.measuredAt).toBe('2026-09-12T00:00:00.000Z');
    expect(nearestMoment([], 0)).toBeNull();
  });

  it('first_toggle_from_all_visible_isolates', () => {
    expect(toggleCompetency(showAll(), 'pronunciation')).toEqual(['pronunciation']);
  });

  it('later_toggles_add_and_remove', () => {
    const isolated = toggleCompetency(showAll(), 'pronunciation');
    const added = toggleCompetency(isolated, 'grammar');

    expect(added).toEqual(['grammar', 'pronunciation']);
    expect(toggleCompetency(added, 'grammar')).toEqual(['pronunciation']);
  });

  it('hiding_the_last_visible_leaves_none', () => {
    expect(toggleCompetency(['grammar'], 'grammar')).toEqual([]);
  });

  it('show_all_restores_every_series', () => {
    expect(showAll()).toEqual([...CHART_COMPETENCIES]);
  });

  it('summary_names_the_range_and_count', () => {
    expect(chartSummary('30d', 7)).toBe('Line chart of your competency scores, last 30 days, 7 measurements.');
    expect(chartSummary('all', 14)).toBe('Line chart of your competency scores, all time, 14 measurements.');
    expect(chartSummary('90d', 1)).toBe('Line chart of your competency scores, last 90 days, 1 measurement.');
  });
});
