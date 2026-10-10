import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_modular/flutter_modular.dart';

import '../../../design/widgets/eq_card.dart';
import '../progress_chart_model.dart';
import '../progress_models.dart';
import 'competency_chart.dart';

/// The chart accessible alternative (F20): one card per moment in the selected
/// range, with a value for every competency it measured (`—` for the rest).
/// A lesson row opens that lesson; an activity has no page yet.
class MomentsList extends StatelessWidget {
  const MomentsList({super.key, required this.moments, required this.serverTime, this.onOpenLesson});

  final List<ChartMoment> moments;
  final DateTime serverTime;

  /// Tests observe navigation here; the app opens the lesson in the Lessons tab.
  final void Function(String lessonId)? onOpenLesson;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final moment in moments)
          Padding(
            padding: EdgeInsets.only(bottom: EqSpacing.gutterMobile),
            child: _MomentRow(
              moment: moment,
              serverTime: serverTime,
              onOpen: moment.lessonId == null
                  ? null
                  : () => onOpenLesson != null
                        ? onOpenLesson!(moment.lessonId!)
                        : context.navigate('/app/lessons/${moment.lessonId}'),
            ),
          ),
      ],
    );
  }
}

class _MomentRow extends StatelessWidget {
  const _MomentRow({required this.moment, required this.serverTime, required this.onOpen});

  final ChartMoment moment;
  final DateTime serverTime;
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final label = momentLabel(moment, serverTime);
    final values = [
      for (final competency in chartCompetencies)
        '${competency.label} ${moment.entries.where((entry) => entry.competency == competency).firstOrNull?.score ?? '—'}',
    ];

    final card = EqCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(label, style: EqTextStyles.titleMd(dark: dark)),
          SizedBox(height: EqSpacing.xs),
          Text(values.join(' · '), style: EqTextStyles.bodySm(dark: dark)),
        ],
      ),
    );
    if (onOpen == null || moment.sourceKind != MeasurementSourceKind.lesson) {
      return Semantics(container: true, label: '$label. ${values.join(', ')}', excludeSemantics: true, child: card);
    }
    return Semantics(
      container: true,
      button: true,
      label: '$label. ${values.join(', ')}',
      onTap: onOpen,
      excludeSemantics: true,
      child: GestureDetector(behavior: HitTestBehavior.opaque, onTap: onOpen, child: card),
    );
  }
}
