import 'package:dio/dio.dart';
import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_modular/flutter_modular.dart';
import 'package:get/get.dart';

import '../../design/widgets/eq_button.dart';
import '../../design/widgets/eq_card.dart';
import '../../design/widgets/eq_page_state.dart';
import '../../design/widgets/eq_segmented_control.dart';
import '../profile/ledger_entry_sheet.dart';
import '../profile/widgets/weakness_row.dart';
import 'progress_chart_model.dart';
import 'progress_controller.dart';
import 'progress_models.dart';
import 'widgets/chart_palette.dart';
import 'widgets/competency_chart.dart';
import 'widgets/competency_legend.dart';
import 'widgets/moments_list.dart';

/// The progress dashboard (F20) — the mobile mirror of the web `/profile/progress`,
/// with the same data, ranges and copy: the competency chart, the legend that
/// is also the snapshot, then F12 recurring weaknesses. No mockup exists for
/// either client; it is composed from the `Eq*` widgets only. The plot is a
/// tap-or-drag selection with a readout under it, and the weakness detail is
/// a bottom sheet.
class ProgressPage extends StatefulWidget {
  const ProgressPage({super.key, this.controller, this.onOpenLesson});

  /// Injected by tests; the app builds one over the shared `Dio`.
  final ProgressController? controller;

  /// Tests observe navigation here; the app opens the lesson in the Lessons tab.
  final void Function(String lessonId)? onOpenLesson;

  @override
  State<ProgressPage> createState() => _ProgressPageState();
}

class _ProgressPageState extends State<ProgressPage> {
  late final ProgressController _progress = widget.controller ?? ProgressController(inject<Dio>());

  @override
  void initState() {
    super.initState();
    _progress.load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Progress')),
      body: SafeArea(
        child: Obx(() {
          final error = _progress.loadError.value;
          final view = _progress.view.value;

          final Widget content;
          if (error != null) {
            content = Padding(
              padding: EdgeInsets.only(top: EqSpacing.xl),
              child: EqError(cause: error, onRetry: _progress.load),
            );
          } else if (view == null) {
            content = const EqLoading(blockCount: 6, blockHeight: 48);
          } else if (view.profile.empty) {
            content = Padding(
              padding: EdgeInsets.only(top: EqSpacing.xl),
              child: const EqEmpty(message: 'No progress yet. Your progress appears after your first analysed lesson.'),
            );
          } else {
            content = _ProgressContent(view: view, progress: _progress, onOpenLesson: widget.onOpenLesson);
          }

          return RefreshIndicator(
            onRefresh: _progress.load,
            child: ListView(
              padding: EdgeInsets.symmetric(horizontal: EqSpacing.marginMobile, vertical: EqSpacing.lg),
              children: [
                Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 560),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [const _Heading(), SizedBox(height: EqSpacing.lg), content],
                    ),
                  ),
                ),
              ],
            ),
          );
        }),
      ),
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading();

  @override
  Widget build(BuildContext context) {
    final palette = ChartPalette.of(context);
    return Text(
      'How your competencies have changed, and what keeps coming back.',
      style: EqTextStyles.bodyMd(dark: palette.dark).copyWith(color: palette.onSurfaceVariant),
    );
  }
}

class _ProgressContent extends StatelessWidget {
  const _ProgressContent({required this.view, required this.progress, required this.onOpenLesson});

  final ProgressDashboardView view;
  final ProgressController progress;
  final void Function(String lessonId)? onOpenLesson;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final profile = view.profile;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (profile.notes.isNotEmpty) ...[
          EqCard(
            tone: EqCardTone.info,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [for (final note in profile.notes) Text(note, style: EqTextStyles.bodyMd(dark: dark))],
            ),
          ),
          SizedBox(height: EqSpacing.gutterMobile),
        ],
        _ChartCard(view: view, progress: progress, onOpenLesson: onOpenLesson),
        SizedBox(height: EqSpacing.gutterMobile),
        EqCard(
          header: Text('Recurring weaknesses', style: EqTextStyles.titleLg(dark: dark)),
          child: profile.recurringWeaknesses.isEmpty
              ? Text(
                  'No recurring weaknesses yet. A tag appears here once it occurs 3 times within 30 days.',
                  style: EqTextStyles.bodyMd(dark: dark),
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (final entry in profile.recurringWeaknesses)
                      Padding(
                        padding: EdgeInsets.only(bottom: EqSpacing.sm),
                        child: WeaknessRow(
                          entry: entry,
                          serverTime: profile.serverTime,
                          onTap: () => showLedgerEntrySheet(
                            context,
                            entryId: entry.id,
                            label: entry.label,
                            load: progress.loadEntry,
                          ),
                        ),
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}

class _ChartCard extends StatelessWidget {
  const _ChartCard({required this.view, required this.progress, required this.onOpenLesson});

  final ProgressDashboardView view;
  final ProgressController progress;
  final void Function(String lessonId)? onOpenLesson;

  @override
  Widget build(BuildContext context) {
    final palette = ChartPalette.of(context);
    final dark = palette.dark;
    final history = view.competencyHistory;
    final caption = EqTextStyles.bodyMd(dark: dark).copyWith(color: palette.onSurfaceVariant);
    final gap = SizedBox(height: EqSpacing.md);

    return EqCard(
      header: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(header: true, child: Text('Competencies over time', style: EqTextStyles.titleLg(dark: dark))),
          SizedBox(height: EqSpacing.xs),
          Text(
            'Each point is your smoothed score after a lesson or an activity — up to your last '
            '${history.pointsPerCompetency} per competency.',
            style: caption,
          ),
        ],
      ),
      child: Obx(() {
        final range = progress.range.value;
        final visible = progress.visible.value;
        final selected = progress.selected.value;
        final since = history.sinceOf(range);
        final inRange = seriesInRange(history.series, since);
        final domain = chartDomain(inRange, since, view.serverTime);
        final warmingUp = {for (final entry in view.profile.competencies) entry.competency: entry.warmingUp};
        final allMoments = momentsOf(inRange, chartCompetencies);

        final Widget plot;
        if (!history.chartable) {
          plot = _ChartEmpty(title: 'Not enough data yet — complete 3 lessons to see trends.', palette: palette);
        } else if (domain == null) {
          plot = _ChartEmpty(
            title: 'No measurements in the last ${range.label}.',
            hint: 'Choose a longer range to see earlier ones.',
            palette: palette,
          );
        } else if (visible.isEmpty) {
          plot = _ChartEmpty(title: 'Every line is hidden. Choose a competency below, or show all.', palette: palette);
        } else {
          plot = CompetencyChart(
            series: inRange,
            visible: visible,
            domain: domain,
            warmingUp: warmingUp,
            summary: chartSummary(range, countPoints(inRange)),
            selected: selected,
            onSelect: (moment) => progress.selected.value = moment,
          );
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            EqSegmentedControl<ProgressRange>(
              label: 'Time range',
              value: range,
              onChanged: progress.selectRange,
              options: [for (final option in ProgressRange.values) EqSegmentedOption(value: option, label: option.label)],
            ),
            gap,
            plot,
            SizedBox(height: EqSpacing.sm),
            _SourceKey(palette: palette),
            if (history.chartable && domain != null && visible.isNotEmpty) ...[
              SizedBox(height: EqSpacing.sm),
              Semantics(
                liveRegion: true,
                container: true,
                child: Text(
                  selected == null
                      ? 'Tap the chart to see a measurement.'
                      : momentAnnouncement(selected, view.serverTime),
                  style: EqTextStyles.bodySm(dark: dark).copyWith(
                    color: selected == null ? palette.onSurfaceVariant : palette.onSurface,
                  ),
                ),
              ),
            ],
            gap,
            CompetencyLegend(
              competencies: view.profile.competencies,
              visible: visible,
              onToggle: progress.toggle,
            ),
            SizedBox(height: EqSpacing.sm),
            Text('Tap a competency to show only its line.', style: EqTextStyles.bodySm(dark: dark).copyWith(color: palette.onSurfaceVariant)),
            if (visible.length != chartCompetencies.length) ...[
              SizedBox(height: EqSpacing.sm),
              Align(
                alignment: Alignment.centerLeft,
                child: EqButton(
                  label: 'Show all',
                  variant: EqButtonVariant.neutral,
                  size: EqButtonSize.sm,
                  onPressed: progress.revealAll,
                ),
              ),
            ],
            if (history.chartable && domain != null) ...[
              SizedBox(height: EqSpacing.md),
              Align(
                alignment: Alignment.centerLeft,
                child: Semantics(
                  expanded: progress.listOpen.value,
                  child: EqButton(
                    label: progress.listOpen.value ? 'Hide list' : 'Show as list',
                    variant: EqButtonVariant.neutral,
                    size: EqButtonSize.sm,
                    onPressed: () => progress.listOpen.toggle(),
                  ),
                ),
              ),
              if (progress.listOpen.value) ...[
                SizedBox(height: EqSpacing.md),
                MomentsList(moments: allMoments, serverTime: view.serverTime, onOpenLesson: onOpenLesson),
              ],
            ],
          ],
        );
      }),
    );
  }
}

class _ChartEmpty extends StatelessWidget {
  const _ChartEmpty({required this.title, required this.palette, this.hint});

  final String title;
  final String? hint;
  final ChartPalette palette;

  @override
  Widget build(BuildContext context) {
    final dark = palette.dark;
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 160),
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(EqRadius.md),
          border: Border.all(color: palette.outlineVariant, width: 2),
        ),
        child: Padding(
          padding: EdgeInsets.all(EqSpacing.lg),
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(title, textAlign: TextAlign.center, style: EqTextStyles.titleMd(dark: dark)),
                if (hint != null) ...[
                  SizedBox(height: EqSpacing.xs),
                  Text(
                    hint!,
                    textAlign: TextAlign.center,
                    style: EqTextStyles.bodyMd(dark: dark).copyWith(color: palette.onSurfaceVariant),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A filled circle for a lesson, a hollow diamond for an activity: shape, not colour.
class _SourceKey extends StatelessWidget {
  const _SourceKey({required this.palette});

  final ChartPalette palette;

  @override
  Widget build(BuildContext context) {
    final style = EqTextStyles.bodySm(dark: palette.dark).copyWith(color: palette.onSurfaceVariant);
    return Semantics(
      container: true,
      label: 'Source key: circle for a lesson, diamond for an activity',
      excludeSemantics: true,
      child: Wrap(
        spacing: EqSpacing.md,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(color: palette.onSurface, shape: BoxShape.circle),
              ),
              SizedBox(width: EqSpacing.xs),
              Text('Lesson', style: style),
            ],
          ),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Transform.rotate(
                angle: 0.785398,
                child: Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(border: Border.all(color: palette.onSurface, width: 2)),
                ),
              ),
              SizedBox(width: EqSpacing.xs),
              Text('Activity', style: style),
            ],
          ),
        ],
      ),
    );
  }
}
