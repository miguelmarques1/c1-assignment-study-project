import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../../design/widgets/eq_button.dart';
import '../../../design/widgets/eq_card.dart';
import '../plan_models.dart';

/// A build in progress, or the newest build's failure — never both (§5). Renders nothing otherwise.
class PlanStatusBanner extends StatelessWidget {
  const PlanStatusBanner({
    super.key,
    required this.preparing,
    required this.failure,
    required this.retrying,
    required this.onRetry,
  });

  final PlanPreparing? preparing;
  final PlanFailure? failure;
  final bool retrying;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final building = preparing;
    if (building != null) {
      return EqCard(
        tone: EqCardTone.info,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Expanded(child: Text('Preparing your plan…')),
            if (building.progressDone != null && building.progressTotal != null)
              Text('${building.progressDone} of ${building.progressTotal}'),
          ],
        ),
      );
    }

    final failed = failure;
    if (failed != null) {
      return EqCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(failed.message),
            SizedBox(height: EqSpacing.sm),
            EqButton(
              label: 'Retry',
              onPressed: onRetry,
              loading: retrying,
              loadingLabel: 'Retrying…',
              variant: EqButtonVariant.destructive,
              size: EqButtonSize.sm,
            ),
          ],
        ),
      );
    }

    return const SizedBox.shrink();
  }
}
