import 'package:flutter/material.dart';
import 'package:flutter_modular/flutter_modular.dart';

import '../../../design/widgets/eq_page_state.dart';

/// Every reason the runner can't record right now: the server's own blocks
/// (`azureKeyMissing`, `planArchived`, `activitySkipped`, most fundamental
/// first per the API's own ordering) plus the denied-permission gate the
/// device itself reports (A31). Mirrors the web's `speaking-blocked.tsx`.
enum SpeakingGate { azureKeyMissing, planArchived, activitySkipped, micDenied }

const _messages = {
  SpeakingGate.azureKeyMissing: 'Add your Azure Speech key to use speaking activities.',
  SpeakingGate.planArchived: 'This activity is no longer in your current plan.',
  SpeakingGate.activitySkipped: 'This activity was skipped, so it takes no new recordings.',
  SpeakingGate.micDenied: 'English Quest needs microphone access for speaking activities.',
};

class SpeakingBlocked extends StatelessWidget {
  const SpeakingBlocked({super.key, required this.gate, this.onRetry});

  final SpeakingGate gate;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    if (gate == SpeakingGate.azureKeyMissing) {
      return EqEmpty(
        message: _messages[gate]!,
        actionLabel: 'Open settings',
        onAction: () => context.navigate('/app/settings'),
      );
    }

    if (gate == SpeakingGate.micDenied && onRetry != null) {
      return EqEmpty(message: _messages[gate]!, actionLabel: 'Try again', onAction: onRetry);
    }

    return EqEmpty(message: _messages[gate]!);
  }
}
