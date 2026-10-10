import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../plan/plan_models.dart';
import '../activity_models.dart';
import 'palette.dart';

/// Where this activity sits in the day's session: one segment per activity
/// (done, current, pending) and the position as text (`Activity 2 of 3`).
class SessionProgress extends StatelessWidget {
  const SessionProgress({super.key, required this.session, required this.currentId});

  final ActivitySession session;
  final String currentId;

  @override
  Widget build(BuildContext context) {
    final palette = EqPalette.of(context);
    final activities = [...session.activities]..sort((a, b) => a.position.compareTo(b.position));
    final label = 'Activity ${session.position} of ${session.count}';

    return Semantics(
      label: 'Session progress, $label',
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              for (var i = 0; i < activities.length; i++) ...[
                if (i > 0) SizedBox(width: EqSpacing.xs),
                Expanded(
                  child: Container(
                    height: 8,
                    decoration: BoxDecoration(
                      color: activities[i].id == currentId
                          ? palette.secondary
                          : (activities[i].state == PlanActivityState.completed || activities[i].state == PlanActivityState.skipped)
                          ? palette.primary
                          : palette.surfaceHighest,
                      borderRadius: BorderRadius.circular(EqRadius.full),
                      border: Border.all(color: palette.outline, width: 2),
                    ),
                  ),
                ),
              ],
            ],
          ),
          SizedBox(height: EqSpacing.xs),
          Text(label, style: EqTextStyles.labelMd(dark: palette.dark)),
        ],
      ),
    );
  }
}
