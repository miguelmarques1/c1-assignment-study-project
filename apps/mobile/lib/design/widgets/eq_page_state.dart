import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import 'eq_button.dart';

/// A skeleton shaped like the incoming content — never a spinner, so a
/// screen never reads as "frozen" versus "still loading."
class EqLoading extends StatelessWidget {
  const EqLoading({super.key, this.blockCount = 3, this.blockHeight = 16});

  final int blockCount;
  final double blockHeight;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final blockColor = dark ? EqDarkColors.surfaceContainerHighest : EqLightColors.surfaceContainerHighest;

    return Column(
      key: const Key('eq-loading-skeleton'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < blockCount; i++)
          Padding(
            padding: EdgeInsets.only(bottom: i == blockCount - 1 ? 0 : EqSpacing.sm),
            child: Container(
              height: blockHeight,
              decoration: BoxDecoration(color: blockColor, borderRadius: BorderRadius.circular(EqRadius.sm)),
            ),
          ),
      ],
    );
  }
}

/// Names what's missing and offers exactly one action.
class EqEmpty extends StatelessWidget {
  const EqEmpty({super.key, required this.message, required this.actionLabel, required this.onAction});

  final String message;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;

    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(message, style: EqTextStyles.bodyLg(dark: dark), textAlign: TextAlign.center),
          SizedBox(height: EqSpacing.md),
          EqButton(label: actionLabel, onPressed: onAction),
        ],
      ),
    );
  }
}

/// Names the cause; [onRetry] is required, not optional — an error state
/// with no way forward isn't one of the three states this app has.
class EqError extends StatelessWidget {
  const EqError({super.key, required this.cause, required this.onRetry});

  final String cause;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;

    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(cause, style: EqTextStyles.bodyLg(dark: dark), textAlign: TextAlign.center),
          SizedBox(height: EqSpacing.md),
          EqButton(label: 'Retry', onPressed: onRetry, variant: EqButtonVariant.secondary),
        ],
      ),
    );
  }
}
