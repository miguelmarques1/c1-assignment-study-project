/// The progress chart's pure model (F20): filtering, domains, positions,
/// ticks, markers, moments and legend state, with no widgets. The Dart twin of
/// the web's `lib/progress-chart.ts`, pinned by the same case table, so the
/// axes and the data on the two clients cannot drift. Times are epoch
/// milliseconds.
library;

import '../profile/profile_models.dart';
import 'progress_models.dart';

/// The learning profile order, which is also the legend order and the colour order.
const chartCompetencies = ProfileCompetency.values;

enum MarkerShape { circle, diamond }

class ChartDomain {
  const ChartDomain({required this.from, required this.to});

  final int from;
  final int to;

  @override
  bool operator ==(Object other) => other is ChartDomain && other.from == from && other.to == to;

  @override
  int get hashCode => Object.hash(from, to);

  @override
  String toString() => 'ChartDomain($from, $to)';
}

class ChartPlot {
  const ChartPlot({required this.left, required this.top, required this.width, required this.height});

  final double left;
  final double top;
  final double width;
  final double height;
}

class MomentEntry {
  const MomentEntry({required this.competency, required this.score});

  final ProfileCompetency competency;
  final int score;
}

/// One instant on the chart: a lesson, or an activity, with the visible competencies it measured.
class ChartMoment {
  const ChartMoment({
    required this.at,
    required this.measuredAt,
    required this.sourceKind,
    required this.lessonId,
    required this.activityId,
    required this.entries,
  });

  final int at;
  final DateTime measuredAt;
  final MeasurementSourceKind sourceKind;
  final String? lessonId;
  final String? activityId;
  final List<MomentEntry> entries;
}

/// Below this plot width the x axis carries three ticks instead of five.
const widePlotFrom = 480;

const yTicks = [0, 25, 50, 75, 100];

/// The margins around the plot: room for the y labels at the left and the x labels below.
ChartPlot plotRect(double width, double height) {
  const left = 36.0;
  const right = 12.0;
  const top = 12.0;
  const bottom = 28.0;
  return ChartPlot(
    left: left,
    top: top,
    width: (width - left - right).clamp(0, double.infinity),
    height: (height - top - bottom).clamp(0, double.infinity),
  );
}

/// Keeps points whose `measuredAt` is on or after `since`; null keeps every point.
List<CompetencyHistoryPoint> pointsInRange(List<CompetencyHistoryPoint> points, DateTime? since) {
  if (since == null) return List.of(points);
  return points.where((point) => !point.measuredAt.isBefore(since)).toList();
}

List<CompetencyHistorySeries> seriesInRange(List<CompetencyHistorySeries> series, DateTime? since) => [
  for (final entry in series)
    CompetencyHistorySeries(competency: entry.competency, points: pointsInRange(entry.points, since)),
];

int countPoints(List<CompetencyHistorySeries> series) => series.fold(0, (total, entry) => total + entry.points.length);

/// Null when no point is in range. Otherwise it runs from `since` (the
/// earliest in-range point for `All time`) to the server now, computed over
/// every series so hiding a line never rescales the axis.
ChartDomain? chartDomain(List<CompetencyHistorySeries> inRange, DateTime? since, DateTime serverTime) {
  int? earliest;
  for (final entry in inRange) {
    for (final point in entry.points) {
      final at = point.measuredAt.millisecondsSinceEpoch;
      if (earliest == null || at < earliest) earliest = at;
    }
  }
  if (earliest == null) return null;
  return ChartDomain(
    from: since == null ? earliest : since.millisecondsSinceEpoch,
    to: serverTime.millisecondsSinceEpoch,
  );
}

/// Linear in time; a single-instant domain centres its points.
double xOf(num at, ChartDomain domain, ChartPlot plot) {
  if (domain.to <= domain.from) return plot.left + plot.width / 2;
  final fraction = (at - domain.from) / (domain.to - domain.from);
  return plot.left + fraction.clamp(0, 1) * plot.width;
}

/// 0–100 mapped top-down.
double yOf(num score, ChartPlot plot) => plot.top + (1 - score.clamp(0, 100) / 100) * plot.height;

/// Evenly spaced instants including both ends: five from a plot width of 480, else three.
List<double> timeTicks(ChartDomain domain, double plotWidth) {
  if (domain.to <= domain.from) return [domain.from.toDouble()];
  final count = plotWidth >= widePlotFrom ? 5 : 3;
  return [for (var index = 0; index < count; index++) domain.from + (domain.to - domain.from) * index / (count - 1)];
}

/// A warming-up competency, or one with fewer than two points in range, is drawn as markers only.
bool drawsLine(int pointsInRangeCount, bool warmingUp) => !warmingUp && pointsInRangeCount >= 2;

MarkerShape markerFor(MeasurementSourceKind sourceKind) =>
    sourceKind == MeasurementSourceKind.lesson ? MarkerShape.circle : MarkerShape.diamond;

/// The 1-based colour role: `grammar` is `chart-1` … `pronunciation` is `chart-6`.
int seriesRole(ProfileCompetency competency) => competency.index + 1;

/// Groups points by (`measuredAt`, `sourceKind`): every competency one lesson
/// measured shares the lesson start time, so a lesson is one moment. Sorted
/// by time, a lesson before an activity at the same instant; each moment lists
/// only the visible competencies, in the profile order.
List<ChartMoment> momentsOf(List<CompetencyHistorySeries> inRange, List<ProfileCompetency> visible) {
  final byKey = <String, ChartMoment>{};
  for (final entry in inRange) {
    if (!visible.contains(entry.competency)) continue;
    for (final point in entry.points) {
      final key = '${point.measuredAt.millisecondsSinceEpoch}|${point.sourceKind.name}';
      final moment = byKey.putIfAbsent(
        key,
        () => ChartMoment(
          at: point.measuredAt.millisecondsSinceEpoch,
          measuredAt: point.measuredAt,
          sourceKind: point.sourceKind,
          lessonId: point.lessonId,
          activityId: point.activityId,
          entries: [],
        ),
      );
      moment.entries.add(MomentEntry(competency: entry.competency, score: point.score));
    }
  }
  final moments = byKey.values.toList();
  for (final moment in moments) {
    moment.entries.sort((a, b) => a.competency.index.compareTo(b.competency.index));
  }
  moments.sort((a, b) {
    final byTime = a.at.compareTo(b.at);
    if (byTime != 0) return byTime;
    if (a.sourceKind == b.sourceKind) return 0;
    return a.sourceKind == MeasurementSourceKind.lesson ? -1 : 1;
  });
  return moments;
}

/// The moment with the smallest time distance; a tie goes to the earlier one.
ChartMoment? nearestMoment(List<ChartMoment> moments, num at) {
  ChartMoment? best;
  for (final moment in moments) {
    if (best == null || (moment.at - at).abs() < (best.at - at).abs()) best = moment;
  }
  return best;
}

/// From all visible, the first tap isolates that competency; later taps add or remove lines.
List<ProfileCompetency> toggleCompetency(List<ProfileCompetency> visible, ProfileCompetency competency) {
  if (visible.length == chartCompetencies.length) return [competency];
  final next = visible.contains(competency)
      ? visible.where((entry) => entry != competency).toList()
      : [...visible, competency];
  return [
    for (final entry in chartCompetencies)
      if (next.contains(entry)) entry,
  ];
}

List<ProfileCompetency> showAll() => List.of(chartCompetencies);

String chartSummary(ProgressRange range, int pointCount) {
  final span = switch (range) {
    ProgressRange.all => 'all time',
    ProgressRange.days90 => 'last 90 days',
    ProgressRange.days30 => 'last 30 days',
  };
  final noun = pointCount == 1 ? 'measurement' : 'measurements';
  return 'Line chart of your competency scores, $span, $pointCount $noun.';
}
