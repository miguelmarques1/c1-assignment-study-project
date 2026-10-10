import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../../design/widgets/eq_button.dart';
import '../../../design/widgets/eq_text_field.dart';
import 'palette.dart';

const skipPresets = ['Not relevant to me', 'Too difficult right now', 'Not enough time today', "Something isn't working"];
const _other = 'Other';

/// Skipping asks for a reason (A18): four presets for a one-handed skip, and
/// `Other` with a free-text field. [onSkip] performs the skip and throws to
/// keep the sheet open; its message is shown. A bottom sheet, following
/// `ledger_entry_sheet.dart`.
Future<void> showSkipActivitySheet(BuildContext context, {required Future<void> Function(String reason) onSkip}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (sheetContext) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(sheetContext).bottom),
      child: SkipActivitySheet(onSkip: onSkip, onClose: () => Navigator.of(sheetContext).pop()),
    ),
  );
}

class SkipActivitySheet extends StatefulWidget {
  const SkipActivitySheet({super.key, required this.onSkip, required this.onClose});

  final Future<void> Function(String reason) onSkip;
  final VoidCallback onClose;

  @override
  State<SkipActivitySheet> createState() => _SkipActivitySheetState();
}

class _SkipActivitySheetState extends State<SkipActivitySheet> {
  var _choice = skipPresets.first;
  final _otherText = TextEditingController();
  var _saving = false;
  String? _error;

  String get _reason => _choice == _other ? _otherText.text.trim() : _choice;

  @override
  void dispose() {
    _otherText.dispose();
    super.dispose();
  }

  Future<void> _skip() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.onSkip(_reason);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = error is Exception ? error.toString().replaceFirst('Exception: ', '') : 'The activity could not be skipped.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = EqPalette.of(context);

    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(EqSpacing.marginMobile, 0, EqSpacing.marginMobile, EqSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Skip this activity?', style: EqTextStyles.headlineSm(dark: palette.dark)),
            SizedBox(height: EqSpacing.xs),
            Text('Tell us why, so your plan can do better next time.', style: EqTextStyles.bodyMd(dark: palette.dark)),
            SizedBox(height: EqSpacing.md),
            for (final option in [...skipPresets, _other]) ...[
              Semantics(
                inMutuallyExclusiveGroup: true,
                checked: _choice == option,
                button: true,
                label: option,
                excludeSemantics: true,
                child: InkWell(
                  onTap: _saving ? null : () => setState(() => _choice = option),
                  borderRadius: BorderRadius.circular(EqRadius.md),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: 48),
                    child: Row(
                      children: [
                        Container(
                          width: 20,
                          height: 20,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: _choice == option ? palette.primary : palette.surfaceLowest,
                            border: Border.all(color: palette.outline, width: 2),
                          ),
                        ),
                        SizedBox(width: EqSpacing.sm),
                        Expanded(child: Text(option, style: EqTextStyles.bodyMd(dark: palette.dark))),
                      ],
                    ),
                  ),
                ),
              ),
            ],
            if (_choice == _other) ...[
              SizedBox(height: EqSpacing.sm),
              EqTextField(controller: _otherText, label: 'Your reason', maxLength: 200, onChanged: (_) => setState(() {})),
            ],
            if (_error != null) ...[
              SizedBox(height: EqSpacing.sm),
              Text(_error!, style: EqTextStyles.bodyMd(dark: palette.dark).copyWith(color: palette.error)),
            ],
            SizedBox(height: EqSpacing.md),
            EqButton(
              label: 'Skip activity',
              variant: EqButtonVariant.destructive,
              loading: _saving,
              loadingLabel: 'Skipping…',
              onPressed: _reason.isEmpty ? null : _skip,
            ),
            SizedBox(height: EqSpacing.sm),
            EqButton(label: 'Keep going', variant: EqButtonVariant.neutral, onPressed: _saving ? null : widget.onClose),
          ],
        ),
      ),
    );
  }
}
