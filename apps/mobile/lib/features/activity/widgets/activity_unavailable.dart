import 'package:flutter/material.dart';

import '../../../design/widgets/eq_page_state.dart';
import '../objective_runner_controller.dart';

/// The terminal states, on the shared empty-state convention.
class ActivityUnavailable extends StatelessWidget {
  const ActivityUnavailable({super.key, required this.reason, required this.skipReason, required this.onGoToPlan, required this.onGoToToday});

  final UnavailableReason reason;
  final String? skipReason;
  final VoidCallback onGoToPlan;
  final VoidCallback onGoToToday;

  @override
  Widget build(BuildContext context) {
    switch (reason) {
      case UnavailableReason.replaced:
        return EqEmpty(message: 'This activity is no longer in your current plan.', actionLabel: 'Go to your plan', onAction: onGoToPlan);
      case UnavailableReason.skipped:
        return EqEmpty(
          message: skipReason == null ? 'You skipped this activity.' : 'You skipped this activity.\nReason: $skipReason',
          actionLabel: 'Back to Today',
          onAction: onGoToToday,
        );
      case UnavailableReason.notRunnable:
        return EqEmpty(message: 'This activity could not be corrected.', actionLabel: 'Back to Today', onAction: onGoToToday);
      case UnavailableReason.notObjective:
        return EqEmpty(message: "This activity isn't available here.", actionLabel: 'Go to your plan', onAction: onGoToPlan);
    }
  }
}
