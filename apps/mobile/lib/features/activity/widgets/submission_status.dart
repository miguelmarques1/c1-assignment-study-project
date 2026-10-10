import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../../design/widgets/eq_button.dart';
import '../objective_runner_controller.dart';
import 'palette.dart';

/// What the submission is doing (A31): sending, waiting for the connection
/// (automatic retry plus a manual one), or failed on the server (a human
/// decision). The answers stay on screen in every case.
class SubmissionStatus extends StatelessWidget {
  const SubmissionStatus({super.key, required this.phase, required this.onRetry});

  final RunnerPhase phase;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final palette = EqPalette.of(context);

    Widget banner(String message, Color background, Color foreground, String action) => DecoratedBox(
      decoration: palette.box(color: background, radius: EqRadius.md),
      child: Padding(
        padding: EdgeInsets.all(EqSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(message, style: EqTextStyles.bodyMd(dark: palette.dark).copyWith(color: foreground)),
            SizedBox(height: EqSpacing.sm),
            EqButton(label: action, size: EqButtonSize.sm, variant: EqButtonVariant.neutral, onPressed: onRetry),
          ],
        ),
      ),
    );

    switch (phase) {
      case RunnerPhase.submitting:
        return Semantics(liveRegion: true, child: Text('Saving your answers…', style: EqTextStyles.bodyMd(dark: palette.dark)));
      case RunnerPhase.waitingForConnection:
        return banner(
          "You're offline. Your answers are saved on this device and will be sent when you reconnect.",
          palette.warningBg,
          palette.warningFg,
          'Retry now',
        );
      case RunnerPhase.saveFailed:
        return banner('Your answers could not be saved. Retry?', palette.dangerBg, palette.dangerFg, 'Retry');
      case RunnerPhase.answering:
      case RunnerPhase.results:
      case RunnerPhase.unavailable:
        return const SizedBox.shrink();
    }
  }
}
