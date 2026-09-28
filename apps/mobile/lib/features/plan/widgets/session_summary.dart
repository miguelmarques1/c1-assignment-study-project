import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../plan_models.dart';

/// `3 activities completed · 1 skipped · 8 of 10 correct · 18 min`, each part
/// dropped when it doesn't apply. [completionPercent], when passed, adds the
/// plan-wide figure — the Today tab's "completed today" state shows both.
class SessionSummary extends StatelessWidget {
  const SessionSummary({super.key, required this.summary, this.completionPercent});

  final PlanSessionSummary summary;
  final int? completionPercent;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final muted = dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant;

    final parts = <String>['${summary.completed} ${summary.completed == 1 ? 'activity' : 'activities'} completed'];
    if (summary.skipped > 0) parts.add('${summary.skipped} skipped');
    if (summary.correct != null && summary.questions != null) {
      parts.add('${summary.correct} of ${summary.questions} correct');
    }
    if (summary.timeSpentSeconds != null) {
      parts.add('${(summary.timeSpentSeconds! / 60).round()} min');
    }
    if (completionPercent != null) parts.add('plan $completionPercent% complete');

    return Text(parts.join(' · '), style: EqTextStyles.bodySm(dark: dark).copyWith(color: muted));
  }
}
