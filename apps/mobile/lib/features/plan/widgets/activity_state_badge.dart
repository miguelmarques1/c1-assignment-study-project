import 'package:flutter/material.dart';

import '../../../design/widgets/eq_badge.dart';
import '../plan_models.dart';

const _stateBadges = <PlanActivityState, (EqBadgeStatus, String)>{
  PlanActivityState.pending: (EqBadgeStatus.neutral, 'Pending'),
  PlanActivityState.inProgress: (EqBadgeStatus.info, 'In progress'),
  PlanActivityState.completed: (EqBadgeStatus.success, 'Completed'),
  PlanActivityState.skipped: (EqBadgeStatus.warning, 'Skipped'),
};

class ActivityStateBadge extends StatelessWidget {
  const ActivityStateBadge({super.key, required this.state});

  final PlanActivityState state;

  @override
  Widget build(BuildContext context) {
    final (status, label) = _stateBadges[state]!;
    return EqBadge(status: status, label: label);
  }
}
