/// Hand-written mirrors of `packages/shared/src/schemas/progress.ts` (F20).
/// Unknown fields are ignored, so an additive change on the API (the Full
/// scope's activity statistics, for one) never breaks an older app.
library;

import '../profile/profile_models.dart';

/// The chart's range selector; the server owns each range's boundary.
enum ProgressRange {
  all('all', 'All time'),
  days90('90d', '90 days'),
  days30('30d', '30 days');

  const ProgressRange(this.wireValue, this.label);

  final String wireValue;
  final String label;

  static ProgressRange fromWire(String value) => ProgressRange.values.firstWhere((range) => range.wireValue == value);
}

/// Lesson points are drawn as filled circles, activity points as hollow diamonds.
enum MeasurementSourceKind {
  lesson,
  activity;

  static MeasurementSourceKind fromWire(String value) => MeasurementSourceKind.values.byName(value);
}

class ProgressRangeBoundary {
  const ProgressRangeBoundary({required this.range, required this.since});

  factory ProgressRangeBoundary.fromJson(Map<String, dynamic> json) => ProgressRangeBoundary(
    range: ProgressRange.fromWire(json['range'] as String),
    since: json['since'] == null ? null : DateTime.parse(json['since'] as String),
  );

  final ProgressRange range;

  /// Points on or after this instant are in range; null keeps every point.
  final DateTime? since;
}

class CompetencyHistoryPoint {
  const CompetencyHistoryPoint({
    required this.measuredAt,
    required this.score,
    required this.sourceKind,
    required this.lessonId,
    required this.activityId,
  });

  factory CompetencyHistoryPoint.fromJson(Map<String, dynamic> json) => CompetencyHistoryPoint(
    measuredAt: DateTime.parse(json['measuredAt'] as String),
    score: json['score'] as int,
    sourceKind: MeasurementSourceKind.fromWire(json['sourceKind'] as String),
    lessonId: json['lessonId'] as String?,
    activityId: json['activityId'] as String?,
  );

  final DateTime measuredAt;

  /// The smoothed score after this measurement, rounded half up.
  final int score;
  final MeasurementSourceKind sourceKind;
  final String? lessonId;
  final String? activityId;
}

class CompetencyHistorySeries {
  const CompetencyHistorySeries({required this.competency, required this.points});

  factory CompetencyHistorySeries.fromJson(Map<String, dynamic> json) => CompetencyHistorySeries(
    competency: ProfileCompetency.fromWire(json['competency'] as String),
    points: (json['points'] as List).cast<Map<String, dynamic>>().map(CompetencyHistoryPoint.fromJson).toList(),
  );

  final ProfileCompetency competency;

  /// The competency's newest measurements, oldest first.
  final List<CompetencyHistoryPoint> points;
}

class CompetencyHistoryView {
  const CompetencyHistoryView({
    required this.pointsPerCompetency,
    required this.chartable,
    required this.ranges,
    required this.series,
  });

  factory CompetencyHistoryView.fromJson(Map<String, dynamic> json) => CompetencyHistoryView(
    pointsPerCompetency: json['pointsPerCompetency'] as int,
    chartable: json['chartable'] as bool,
    ranges: (json['ranges'] as List).cast<Map<String, dynamic>>().map(ProgressRangeBoundary.fromJson).toList(),
    series: (json['series'] as List).cast<Map<String, dynamic>>().map(CompetencyHistorySeries.fromJson).toList(),
  );

  final int pointsPerCompetency;

  /// At least one competency has 3 or more measurements.
  final bool chartable;
  final List<ProgressRangeBoundary> ranges;

  /// Always six, in the profile order.
  final List<CompetencyHistorySeries> series;

  DateTime? sinceOf(ProgressRange range) {
    for (final boundary in ranges) {
      if (boundary.range == range) return boundary.since;
    }
    return null;
  }
}

/// `GET /progress`.
class ProgressDashboardView {
  const ProgressDashboardView({required this.serverTime, required this.profile, required this.competencyHistory});

  factory ProgressDashboardView.fromJson(Map<String, dynamic> json) => ProgressDashboardView(
    serverTime: DateTime.parse(json['serverTime'] as String),
    profile: LearningProfileView.fromJson(json['profile'] as Map<String, dynamic>),
    competencyHistory: CompetencyHistoryView.fromJson(json['competencyHistory'] as Map<String, dynamic>),
  );

  final DateTime serverTime;
  final LearningProfileView profile;
  final CompetencyHistoryView competencyHistory;
}
