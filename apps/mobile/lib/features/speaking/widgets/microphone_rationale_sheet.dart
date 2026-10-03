import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../design/widgets/eq_button.dart';

const _micRationaleShownKey = 'eq.speaking.micRationaleShown';

Future<bool> hasShownMicrophoneRationale() async {
  final prefs = await SharedPreferences.getInstance();
  return prefs.getBool(_micRationaleShownKey) ?? false;
}

Future<void> markMicrophoneRationaleShown() async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setBool(_micRationaleShownKey, true);
}

/// Shown once per device before the first recording (A31): explains why the
/// microphone is needed before the OS permission prompt appears. Resolves
/// `true` for `Continue`, `false` for `Not now` or a dismissal.
Future<bool> showMicrophoneRationaleSheet(BuildContext context) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (context) => const _MicrophoneRationaleSheet(),
  ).then((result) => result ?? false);
}

class _MicrophoneRationaleSheet extends StatelessWidget {
  const _MicrophoneRationaleSheet();

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.all(EqSpacing.marginMobile),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'English Quest needs your microphone to record your answer. '
              'Recordings stay on your own server and are scored with your own Azure Speech key.',
              style: EqTextStyles.bodyMd(dark: dark),
            ),
            SizedBox(height: EqSpacing.lg),
            EqButton(label: 'Continue', onPressed: () => Navigator.of(context).pop(true)),
            SizedBox(height: EqSpacing.sm),
            EqButton(label: 'Not now', variant: EqButtonVariant.neutral, onPressed: () => Navigator.of(context).pop(false)),
          ],
        ),
      ),
    );
  }
}
