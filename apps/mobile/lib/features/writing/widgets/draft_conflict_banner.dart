import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../design/widgets/eq_button.dart';
import '../writing_controller.dart';

/// `This draft was updated on another device.` (or `This draft was submitted
/// from another device.`), with `View your version` (a bottom sheet holding
/// the local text and a `Copy` button) and `Continue with the latest
/// version` (or `Dismiss`). A conflict is surfaced, never resolved silently
/// (A5, A6).
class DraftConflictBanner extends StatelessWidget {
  const DraftConflictBanner({super.key, required this.variant, required this.localText, required this.onContinue});

  final DraftConflictVariant variant;
  final String localText;
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final onSurface = dark ? EqDarkColors.onSurface : EqLightColors.onSurface;
    final message = variant == DraftConflictVariant.conflict
        ? 'This draft was updated on another device.'
        : 'This draft was submitted from another device.';
    final continueLabel = variant == DraftConflictVariant.conflict ? 'Continue with the latest version' : 'Dismiss';

    return Semantics(
      liveRegion: true,
      child: Container(
        padding: EdgeInsets.all(EqSpacing.md),
        decoration: BoxDecoration(
          color: dark ? EqDarkColors.surfaceContainer : EqLightColors.surfaceContainer,
          borderRadius: BorderRadius.circular(EqRadius.md),
          border: Border.all(color: dark ? EqDarkColors.outlineStrong : EqLightColors.outlineStrong, width: 2),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message, style: EqTextStyles.bodyMd(dark: dark).copyWith(color: onSurface)),
            SizedBox(height: EqSpacing.sm),
            Wrap(
              spacing: EqSpacing.sm,
              runSpacing: EqSpacing.sm,
              children: [
                EqButton(
                  label: 'View your version',
                  variant: EqButtonVariant.neutral,
                  size: EqButtonSize.sm,
                  onPressed: () => _showLocalVersion(context),
                ),
                EqButton(label: continueLabel, size: EqButtonSize.sm, onPressed: onContinue),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _showLocalVersion(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheetContext) => _LocalVersionSheet(text: localText),
    );
  }
}

class _LocalVersionSheet extends StatelessWidget {
  const _LocalVersionSheet({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final onSurface = dark ? EqDarkColors.onSurface : EqLightColors.onSurface;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.all(EqSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Your version', style: EqTextStyles.titleMd(dark: dark).copyWith(color: onSurface)),
            SizedBox(height: EqSpacing.md),
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 320),
              child: SingleChildScrollView(
                child: Text(text, style: EqTextStyles.bodyMd(dark: dark).copyWith(color: onSurface)),
              ),
            ),
            SizedBox(height: EqSpacing.md),
            EqButton(label: 'Copy', variant: EqButtonVariant.neutral, onPressed: () => Clipboard.setData(ClipboardData(text: text))),
          ],
        ),
      ),
    );
  }
}
