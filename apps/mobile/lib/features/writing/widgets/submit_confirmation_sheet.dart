import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../../design/widgets/eq_button.dart';

/// The web dialog's copy as a bottom sheet (`mobile-ui`): names the
/// consequence before spending the caller's own Gemini quota (spec §4).
/// Returns `true` once the submit action has actually been confirmed.
Future<bool?> showSubmitConfirmationSheet(
  BuildContext context, {
  required Future<bool> Function() onSubmit,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    isDismissible: true,
    builder: (sheetContext) => _SubmitConfirmationSheet(onSubmit: onSubmit),
  );
}

class _SubmitConfirmationSheet extends StatefulWidget {
  const _SubmitConfirmationSheet({required this.onSubmit});

  final Future<bool> Function() onSubmit;

  @override
  State<_SubmitConfirmationSheet> createState() => _SubmitConfirmationSheetState();
}

class _SubmitConfirmationSheetState extends State<_SubmitConfirmationSheet> {
  bool _submitting = false;
  String? _error;

  Future<void> _confirm() async {
    setState(() {
      _submitting = true;
      _error = null;
    });
    final succeeded = await widget.onSubmit();
    if (!mounted) return;
    if (succeeded) {
      Navigator.of(context).pop(true);
      return;
    }
    setState(() {
      _submitting = false;
      _error = 'Something went wrong. Please try again.';
    });
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final onSurface = dark ? EqDarkColors.onSurface : EqLightColors.onSurface;
    final error = dark ? EqDarkColors.error : EqLightColors.error;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.all(EqSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Submit for correction?', style: EqTextStyles.titleMd(dark: dark).copyWith(color: onSurface)),
            SizedBox(height: EqSpacing.sm),
            Text(
              "Your text will be corrected with your Gemini key. Once submitted, it can't be edited or undone.",
              style: EqTextStyles.bodyMd(dark: dark).copyWith(color: onSurface),
            ),
            if (_error != null) ...[
              SizedBox(height: EqSpacing.sm),
              Text(_error!, style: EqTextStyles.bodySm(dark: dark).copyWith(color: error)),
            ],
            SizedBox(height: EqSpacing.lg),
            EqButton(label: 'Submit', loading: _submitting, loadingLabel: 'Submitting…', onPressed: _confirm),
            SizedBox(height: EqSpacing.sm),
            EqButton(
              label: 'Cancel',
              variant: EqButtonVariant.neutral,
              onPressed: _submitting ? null : () => Navigator.of(context).pop(false),
            ),
          ],
        ),
      ),
    );
  }
}
