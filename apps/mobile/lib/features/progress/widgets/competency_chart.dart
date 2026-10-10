import 'package:flutter/material.dart';

import '../../../core/format/relative_time.dart';
import '../../profile/profile_models.dart';
import '../progress_chart_model.dart';
import '../progress_models.dart';
import 'chart_palette.dart';

/// `Lesson · 12 Mar` or `Activity · 14 Mar`: the readout header, the table
/// row and the list row all use it. [utcOffset] pins the viewer calendar in tests.
String momentLabel(ChartMoment moment, DateTime serverTime, {Duration? utcOffset}) {
  final source = moment.sourceKind == MeasurementSourceKind.lesson ? 'Lesson' : 'Activity';
  return '$source · ${formatShortDate(moment.measuredAt, now: serverTime, utcOffset: utcOffset)}';
}

/// The moment as one sentence, for the live region.
String momentAnnouncement(ChartMoment moment, DateTime serverTime, {Duration? utcOffset}) {
  final values = moment.entries.map((entry) => '${entry.competency.label} ${entry.score}').join(', ');
  return '${momentLabel(moment, serverTime, utcOffset: utcOffset)}. $values.';
}

/// The competency chart (F20), painted on a canvas from the shared pure model
/// with no charting package. A tap or a horizontal drag selects the nearest
/// moment; the owner shows the readout under the plot.
class CompetencyChart extends StatelessWidget {
  const CompetencyChart({
    super.key,
    required this.series,
    required this.visible,
    required this.domain,
    required this.warmingUp,
    required this.summary,
    required this.selected,
    required this.onSelect,
    this.height = 240,
  });

  /// Every competency points already inside the selected range.
  final List<CompetencyHistorySeries> series;
  final List<ProfileCompetency> visible;
  final ChartDomain domain;
  final Map<ProfileCompetency, bool> warmingUp;

  /// The plot accessible name, which summarises it.
  final String summary;
  final ChartMoment? selected;
  final ValueChanged<ChartMoment?> onSelect;
  final double height;

  @override
  Widget build(BuildContext context) {
    final palette = ChartPalette.of(context);
    final moments = momentsOf(series, visible);

    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final plot = plotRect(width, height);

        void select(Offset local) {
          if (moments.isEmpty || plot.width == 0) return;
          final fraction = ((local.dx - plot.left) / plot.width).clamp(0.0, 1.0);
          onSelect(nearestMoment(moments, domain.from + fraction * (domain.to - domain.from)));
        }

        return Semantics(
          container: true,
          label: summary,
          child: ExcludeSemantics(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTapDown: (details) => select(details.localPosition),
              onHorizontalDragUpdate: (details) => select(details.localPosition),
              child: CustomPaint(
                key: const Key('competency-plot'),
                size: Size(width, height),
                painter: _CompetencyChartPainter(
                  series: series,
                  visible: visible,
                  domain: domain,
                  warmingUp: warmingUp,
                  selected: selected,
                  palette: palette,
                  now: DateTime.fromMillisecondsSinceEpoch(domain.to, isUtc: true),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _CompetencyChartPainter extends CustomPainter {
  _CompetencyChartPainter({
    required this.series,
    required this.visible,
    required this.domain,
    required this.warmingUp,
    required this.selected,
    required this.palette,
    required this.now,
  });

  final List<CompetencyHistorySeries> series;
  final List<ProfileCompetency> visible;
  final ChartDomain domain;
  final Map<ProfileCompetency, bool> warmingUp;
  final ChartMoment? selected;
  final ChartPalette palette;
  final DateTime now;

  static const _circleRadius = 4.0;
  static const _diamondSize = 10.0;

  void _text(Canvas canvas, String text, Offset anchor, {required TextAlign align, bool centreY = false}) {
    final painter = TextPainter(
      text: TextSpan(text: text, style: palette.axisLabel),
      textDirection: TextDirection.ltr,
    )..layout();
    final dx = switch (align) {
      TextAlign.right || TextAlign.end => anchor.dx - painter.width,
      TextAlign.center => anchor.dx - painter.width / 2,
      _ => anchor.dx,
    };
    painter.paint(canvas, Offset(dx, centreY ? anchor.dy - painter.height / 2 : anchor.dy));
  }

  Path _diamond(Offset centre, double size) {
    final half = size / 2;
    return Path()
      ..moveTo(centre.dx, centre.dy - half)
      ..lineTo(centre.dx + half, centre.dy)
      ..lineTo(centre.dx, centre.dy + half)
      ..lineTo(centre.dx - half, centre.dy)
      ..close();
  }

  @override
  void paint(Canvas canvas, Size size) {
    final plot = plotRect(size.width, size.height);
    final grid = Paint()
      ..color = palette.outlineVariant
      ..strokeWidth = 1;

    for (final tick in yTicks) {
      final y = yOf(tick, plot);
      canvas.drawLine(Offset(plot.left, y), Offset(plot.left + plot.width, y), grid);
      _text(canvas, '$tick', Offset(plot.left - 8, y), align: TextAlign.right, centreY: true);
    }

    final ticks = timeTicks(domain, plot.width);
    for (var index = 0; index < ticks.length; index++) {
      final date = DateTime.fromMillisecondsSinceEpoch(ticks[index].round(), isUtc: true);
      final align = ticks.length == 1
          ? TextAlign.center
          : index == 0
          ? TextAlign.left
          : index == ticks.length - 1
          ? TextAlign.right
          : TextAlign.center;
      _text(
        canvas,
        formatShortDate(date, now: now),
        Offset(xOf(ticks[index], domain, plot), plot.top + plot.height + 8),
        align: align,
      );
    }

    final active = selected;
    if (active != null) {
      final x = xOf(active.at, domain, plot);
      canvas.drawLine(
        Offset(x, plot.top),
        Offset(x, plot.top + plot.height),
        Paint()
          ..color = palette.outlineStrong
          ..strokeWidth = 1,
      );
    }

    final ring = Paint()..color = palette.surfaceContainerLowest;
    for (final entry in series) {
      if (!visible.contains(entry.competency) || entry.points.isEmpty) continue;
      final colour = palette.seriesColor(entry.competency);
      final offsets = [
        for (final point in entry.points)
          Offset(xOf(point.measuredAt.millisecondsSinceEpoch, domain, plot), yOf(point.score, plot)),
      ];

      if (drawsLine(entry.points.length, warmingUp[entry.competency] ?? true)) {
        final path = Path()..moveTo(offsets.first.dx, offsets.first.dy);
        for (final offset in offsets.skip(1)) {
          path.lineTo(offset.dx, offset.dy);
        }
        canvas.drawPath(
          path,
          Paint()
            ..color = colour
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2
            ..strokeJoin = StrokeJoin.round,
        );
      }

      for (var index = 0; index < offsets.length; index++) {
        if (markerFor(entry.points[index].sourceKind) == MarkerShape.circle) {
          canvas
            ..drawCircle(offsets[index], _circleRadius + 2, ring)
            ..drawCircle(offsets[index], _circleRadius, Paint()..color = colour);
        } else {
          canvas
            ..drawPath(_diamond(offsets[index], _diamondSize + 4), ring)
            ..drawPath(_diamond(offsets[index], _diamondSize), ring)
            ..drawPath(
              _diamond(offsets[index], _diamondSize),
              Paint()
                ..color = colour
                ..style = PaintingStyle.stroke
                ..strokeWidth = 2,
            );
        }
      }
    }
  }

  @override
  bool shouldRepaint(_CompetencyChartPainter old) =>
      old.series != series ||
      old.visible != visible ||
      old.domain != domain ||
      old.selected != selected ||
      old.palette.dark != palette.dark;
}
