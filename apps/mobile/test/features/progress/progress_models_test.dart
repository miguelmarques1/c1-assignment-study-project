import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/progress/progress_chart_model.dart';
import 'package:mobile/features/progress/progress_models.dart';

Map<String, dynamic> fixtureData() {
  final raw = jsonDecode(File('test/features/progress/progress-view.json').readAsStringSync()) as Map<String, dynamic>;
  return raw['data'] as Map<String, dynamic>;
}

void main() {
  group('ProgressDashboardView', () {
    test('parses_the_progress_view', () {
      final view = ProgressDashboardView.fromJson(fixtureData());

      expect(view.serverTime, DateTime.utc(2026, 9, 28, 10));
      expect(view.profile.competencies, hasLength(6));
      expect(view.profile.recurringWeaknesses.first.label, 'Third conditional');
      expect(view.competencyHistory.chartable, isTrue);
      expect(view.competencyHistory.pointsPerCompetency, 20);
      expect(view.competencyHistory.series.map((series) => series.competency), chartCompetencies);
      expect(view.competencyHistory.series.first.points, hasLength(5));
      final last = view.competencyHistory.series.first.points.last;
      expect(last.sourceKind, MeasurementSourceKind.activity);
      expect(last.lessonId, isNull);
      expect(last.activityId, isNotNull);
      expect(last.score, view.profile.competencies.first.score);
    });

    test('maps_range_keys', () {
      final history = ProgressDashboardView.fromJson(fixtureData()).competencyHistory;

      expect(history.ranges.map((boundary) => boundary.range), [
        ProgressRange.all,
        ProgressRange.days90,
        ProgressRange.days30,
      ]);
      expect(ProgressRange.fromWire('90d'), ProgressRange.days90);
      expect(history.sinceOf(ProgressRange.all), isNull);
      expect(history.sinceOf(ProgressRange.days30), DateTime.utc(2026, 8, 29, 10));
    });

    test('ignores_unknown_fields', () {
      final json = fixtureData()
        ..['activity'] = {'weeks': []}
        ..['competencyHistory'] = {...(fixtureData()['competencyHistory'] as Map<String, dynamic>), 'future': 1};

      expect(() => ProgressDashboardView.fromJson(json), returnsNormally);
    });

    test('the_fixture_counts_match_the_web', () {
      final history = ProgressDashboardView.fromJson(fixtureData()).competencyHistory;
      int visibleIn(ProgressRange range) =>
          countPoints(seriesInRange(history.series, history.sinceOf(range)));

      expect(visibleIn(ProgressRange.all), 21);
      expect(visibleIn(ProgressRange.days90), 21);
      expect(visibleIn(ProgressRange.days30), 13);
    });
  });
}
