import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../profile/profile_models.dart';
import 'chart_palette.dart';

({String symbol, String word, String spoken}) _trendWords(CompetencyTrend trend) => switch (trend) {
  CompetencyTrend.up => (symbol: '▲', word: 'Improving', spoken: 'improving'),
  CompetencyTrend.down => (symbol: '▼', word: 'Declining', spoken: 'declining'),
  CompetencyTrend.flat => (symbol: '▶', word: 'Steady', spoken: 'steady'),
};

/// `Grammar: 68, improving` / `Pronunciation: warming up`, the tile accessible name.
String legendLabel(CompetencySnapshot entry) {
  final label = entry.competency.label;
  if (entry.warmingUp || entry.score == null) return '$label: warming up';
  final trend = entry.trend;
  return trend == null ? '$label: ${entry.score}' : '$label: ${entry.score}, ${_trendWords(trend).spoken}';
}

/// The legend and the snapshot in one (F20): six tiles in a 2-column grid,
/// each with its series key, the score or `Warming up`, and the trend from
/// three measurements up. Each tile toggles that competency line.
class CompetencyLegend extends StatelessWidget {
  const CompetencyLegend({super.key, required this.competencies, required this.visible, required this.onToggle});

  /// F12 six, in order: the snapshot the tiles show.
  final List<CompetencySnapshot> competencies;
  final List<ProfileCompetency> visible;
  final ValueChanged<ProfileCompetency> onToggle;

  @override
  Widget build(BuildContext context) {
    final palette = ChartPalette.of(context);
    final gap = EqSpacing.sm;

    return LayoutBuilder(
      builder: (context, constraints) {
        final tileWidth = (constraints.maxWidth - gap) / 2;
        return Wrap(
          spacing: gap,
          runSpacing: gap,
          children: [
            for (final entry in competencies)
              SizedBox(
                width: tileWidth,
                child: _LegendTile(
                  entry: entry,
                  shown: visible.contains(entry.competency),
                  palette: palette,
                  onTap: () => onToggle(entry.competency),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _LegendTile extends StatelessWidget {
  const _LegendTile({required this.entry, required this.shown, required this.palette, required this.onTap});

  final CompetencySnapshot entry;
  final bool shown;
  final ChartPalette palette;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final dark = palette.dark;
    final trend = !entry.warmingUp && entry.trend != null ? _trendWords(entry.trend!) : null;
    final trendColor = switch (entry.trend) {
      CompetencyTrend.up => palette.tertiary,
      CompetencyTrend.down => palette.error,
      _ => palette.onSurfaceVariant,
    };

    return Semantics(
      button: true,
      toggled: shown,
      label: legendLabel(entry),
      excludeSemantics: true,
      onTap: onTap,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: shown ? palette.surfaceContainerLowest : palette.surface,
              borderRadius: BorderRadius.circular(EqRadius.md),
              border: Border.all(color: shown ? palette.outlineStrong : palette.outlineVariant, width: 2),
            ),
            child: Padding(
              padding: EdgeInsets.all(EqSpacing.sm),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Opacity(
                        opacity: shown ? 1 : 0.5,
                        child: Container(width: 20, height: 2, color: palette.seriesColor(entry.competency)),
                      ),
                      SizedBox(width: EqSpacing.sm),
                      Expanded(
                        child: Text(
                          entry.competency.label,
                          style: EqTextStyles.labelMd(dark: dark).copyWith(
                            color: shown ? palette.onSurface : palette.onSurfaceVariant,
                          ),
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: EqSpacing.xs),
                  Wrap(
                    spacing: EqSpacing.sm,
                    crossAxisAlignment: WrapCrossAlignment.end,
                    children: [
                      if (entry.warmingUp || entry.score == null)
                        Text(
                          'Warming up',
                          style: EqTextStyles.labelMd(dark: dark).copyWith(color: palette.onSurfaceVariant),
                        )
                      else
                        Text(
                          '${entry.score}',
                          style: EqTextStyles.titleLg(dark: dark).copyWith(
                            color: shown ? palette.onSurface : palette.onSurfaceVariant,
                          ),
                        ),
                      if (trend != null)
                        Text(
                          '${trend.symbol} ${trend.word}',
                          style: EqTextStyles.labelSm(dark: dark).copyWith(color: trendColor),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
