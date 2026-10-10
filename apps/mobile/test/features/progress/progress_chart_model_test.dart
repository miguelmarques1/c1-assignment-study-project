import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/profile/profile_models.dart';
import 'package:mobile/features/progress/progress_chart_model.dart';
import 'package:mobile/features/progress/progress_models.dart';

// The same cases as the web's `progress-chart.spec.ts`, by the same names.
final _serverTime = DateTime.utc(2026, 9, 28, 10);
final _since90 = DateTime.utc(2026, 6, 30, 10);
const _lesson = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const _activity = '0f1e2d3c-4b5a-4968-8776-5a4b3c2d1e0f';

CompetencyHistoryPoint _lessonPoint(String measuredAt, [int score = 70]) => CompetencyHistoryPoint(
  measuredAt: DateTime.parse(measuredAt),
  score: score,
  sourceKind: MeasurementSourceKind.lesson,
  lessonId: _lesson,
  activityId: null,
);

CompetencyHistoryPoint _activityPoint(String measuredAt, [int score = 70]) => CompetencyHistoryPoint(
  measuredAt: DateTime.parse(measuredAt),
  score: score,
  sourceKind: MeasurementSourceKind.activity,
  lessonId: null,
  activityId: _activity,
);

CompetencyHistorySeries _series(ProfileCompetency competency, List<CompetencyHistoryPoint> points) =>
    CompetencyHistorySeries(competency: competency, points: points);

int _at(String value) => DateTime.parse(value).millisecondsSinceEpoch;

void main() {
  final plot = plotRect(640, 320);

  group('progress chart model', () {
    test('points_in_range_keeps_measurements_on_or_after_since', () {
      final points = [
        _lessonPoint('2026-06-30T09:59:59.000Z'),
        _lessonPoint('2026-06-30T10:00:00.000Z'),
        _lessonPoint('2026-07-01T10:00:00.000Z'),
      ];

      expect(pointsInRange(points, _since90).map((point) => point.measuredAt.toUtc().toIso8601String()), [
        '2026-06-30T10:00:00.000Z',
        '2026-07-01T10:00:00.000Z',
      ]);
    });

    test('all_time_keeps_every_returned_point', () {
      final points = [_lessonPoint('2025-01-01T10:00:00.000Z'), _lessonPoint('2026-07-01T10:00:00.000Z')];

      expect(pointsInRange(points, null), points);
    });

    test('domain_runs_from_since_to_server_time', () {
      final inRange = seriesInRange([
        _series(ProfileCompetency.grammar, [_lessonPoint('2026-07-14T18:00:00.000Z')]),
      ], _since90);

      expect(
        chartDomain(inRange, _since90, _serverTime),
        ChartDomain(from: _since90.millisecondsSinceEpoch, to: _serverTime.millisecondsSinceEpoch),
      );
    });

    test('all_time_domain_starts_at_the_earliest_point', () {
      final inRange = seriesInRange([
        _series(ProfileCompetency.grammar, [_lessonPoint('2026-08-20T18:00:00.000Z')]),
        _series(ProfileCompetency.pronunciation, [_lessonPoint('2026-07-14T18:00:00.000Z')]),
      ], null);

      expect(
        chartDomain(inRange, null, _serverTime),
        ChartDomain(from: _at('2026-07-14T18:00:00.000Z'), to: _serverTime.millisecondsSinceEpoch),
      );
    });

    test('domain_ignores_visibility', () {
      final all = [
        _series(ProfileCompetency.grammar, [_lessonPoint('2026-08-20T18:00:00.000Z')]),
        _series(ProfileCompetency.pronunciation, [_lessonPoint('2026-07-14T18:00:00.000Z')]),
      ];
      final inRange = seriesInRange(all, null);

      // Moments honour the visible set; the domain never takes it.
      expect(momentsOf(inRange, [ProfileCompetency.grammar]).map((moment) => moment.at), [
        _at('2026-08-20T18:00:00.000Z'),
      ]);
      expect(chartDomain(inRange, null, _serverTime)!.from, _at('2026-07-14T18:00:00.000Z'));
    });

    test('no_point_in_range_gives_no_domain', () {
      final since = DateTime.utc(2026, 8, 29, 10);
      final inRange = seriesInRange([
        _series(ProfileCompetency.grammar, [_lessonPoint('2026-06-01T18:00:00.000Z')]),
      ], since);

      expect(chartDomain(inRange, since, _serverTime), isNull);
    });

    test('a_single_instant_domain_centres_its_points', () {
      final domain = ChartDomain(from: _serverTime.millisecondsSinceEpoch, to: _serverTime.millisecondsSinceEpoch);

      expect(xOf(_serverTime.millisecondsSinceEpoch, domain, plot), plot.left + plot.width / 2);
    });

    test('x_and_y_are_linear_with_the_axis_ends_on_the_plot_edges', () {
      const domain = ChartDomain(from: 0, to: 1000);

      expect(xOf(0, domain, plot), plot.left);
      expect(xOf(500, domain, plot), plot.left + plot.width / 2);
      expect(xOf(1000, domain, plot), plot.left + plot.width);
      expect(yOf(100, plot), plot.top);
      expect(yOf(0, plot), plot.top + plot.height);
      expect(yOf(50, plot), plot.top + plot.height / 2);
    });

    test('ticks_are_three_below_480_and_five_at_or_above', () {
      const domain = ChartDomain(from: 0, to: 4000);

      expect(timeTicks(domain, 479), [0, 2000, 4000]);
      expect(timeTicks(domain, 480), [0, 1000, 2000, 3000, 4000]);
    });

    test('warming_up_series_draw_markers_only', () {
      expect(drawsLine(2, true), isFalse);
      expect(drawsLine(2, false), isTrue);
      expect(drawsLine(1, false), isFalse);
    });

    test('markers_follow_the_source_kind', () {
      expect(markerFor(MeasurementSourceKind.lesson), MarkerShape.circle);
      expect(markerFor(MeasurementSourceKind.activity), MarkerShape.diamond);
    });

    test('series_roles_follow_the_profile_order', () {
      expect(chartCompetencies.map(seriesRole), [1, 2, 3, 4, 5, 6]);
      expect(seriesRole(ProfileCompetency.grammar), 1);
      expect(seriesRole(ProfileCompetency.pronunciation), 6);
    });

    test('moments_group_by_time_and_source', () {
      const lessonAt = '2026-09-24T18:00:00.000Z';
      const activityAt = '2026-09-25T18:30:00.000Z';
      final all = [
        for (final competency in chartCompetencies)
          _series(competency, [
            _lessonPoint(lessonAt, 60 + competency.index),
            if (competency == ProfileCompetency.grammar || competency == ProfileCompetency.vocabulary)
              _activityPoint(activityAt, 80 + competency.index),
          ]),
      ];

      final moments = momentsOf(all, showAll());

      expect(moments, hasLength(2));
      expect(moments[0].at, _at(lessonAt));
      expect(moments[0].sourceKind, MeasurementSourceKind.lesson);
      expect(moments[0].lessonId, _lesson);
      expect(moments[0].entries.map((entry) => entry.competency), chartCompetencies);
      expect(moments[1].sourceKind, MeasurementSourceKind.activity);
      expect(moments[1].activityId, _activity);
      expect(moments[1].entries.map((entry) => entry.score), [80, 81]);
    });

    test('moments_list_only_visible_competencies', () {
      final all = [
        for (final competency in chartCompetencies) _series(competency, [_lessonPoint('2026-09-24T18:00:00.000Z')]),
      ];

      final moments = momentsOf(all, chartCompetencies.where((c) => c != ProfileCompetency.grammar).toList());

      expect(moments, hasLength(1));
      expect(moments.expand((moment) => moment.entries.map((entry) => entry.competency)), isNot(contains(ProfileCompetency.grammar)));
    });

    test('a_lesson_sorts_before_an_activity_at_the_same_instant', () {
      const same = '2026-09-24T18:00:00.000Z';
      final moments = momentsOf([
        _series(ProfileCompetency.grammar, [_activityPoint(same), _lessonPoint(same)]),
      ], showAll());

      expect(moments.map((moment) => moment.sourceKind), [MeasurementSourceKind.lesson, MeasurementSourceKind.activity]);
    });

    test('nearest_moment_prefers_the_earlier_on_a_tie', () {
      final moments = momentsOf([
        _series(ProfileCompetency.grammar, [
          _lessonPoint('2026-09-10T00:00:00.000Z'),
          _lessonPoint('2026-09-12T00:00:00.000Z'),
        ]),
      ], showAll());

      expect(nearestMoment(moments, _at('2026-09-11T00:00:00.000Z'))!.at, _at('2026-09-10T00:00:00.000Z'));
      expect(nearestMoment(moments, _at('2026-09-11T12:00:00.000Z'))!.at, _at('2026-09-12T00:00:00.000Z'));
      expect(nearestMoment([], 0), isNull);
    });

    test('first_toggle_from_all_visible_isolates', () {
      expect(toggleCompetency(showAll(), ProfileCompetency.pronunciation), [ProfileCompetency.pronunciation]);
    });

    test('later_toggles_add_and_remove', () {
      final isolated = toggleCompetency(showAll(), ProfileCompetency.pronunciation);
      final added = toggleCompetency(isolated, ProfileCompetency.grammar);

      expect(added, [ProfileCompetency.grammar, ProfileCompetency.pronunciation]);
      expect(toggleCompetency(added, ProfileCompetency.grammar), [ProfileCompetency.pronunciation]);
    });

    test('hiding_the_last_visible_leaves_none', () {
      expect(toggleCompetency([ProfileCompetency.grammar], ProfileCompetency.grammar), isEmpty);
    });

    test('show_all_restores_every_series', () {
      expect(showAll(), chartCompetencies);
    });

    test('summary_names_the_range_and_count', () {
      expect(chartSummary(ProgressRange.days30, 7), 'Line chart of your competency scores, last 30 days, 7 measurements.');
      expect(chartSummary(ProgressRange.all, 14), 'Line chart of your competency scores, all time, 14 measurements.');
      expect(chartSummary(ProgressRange.days90, 1), 'Line chart of your competency scores, last 90 days, 1 measurement.');
    });
  });
}
