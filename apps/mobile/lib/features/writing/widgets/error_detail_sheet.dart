import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../../design/widgets/eq_chip.dart';
import '../writing_models.dart';

/// Opened by a tap on a highlight: the tag, the correction (changed words
/// emphasized) and the explanation (spec §4).
Future<void> showErrorDetailSheet(BuildContext context, WritingErrorView error) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (sheetContext) => _ErrorDetailSheet(error: error),
  );
}

class _ErrorDetailSheet extends StatelessWidget {
  const _ErrorDetailSheet({required this.error});

  final WritingErrorView error;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final onSurface = dark ? EqDarkColors.onSurface : EqLightColors.onSurface;
    final onSurfaceVariant = dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.all(EqSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            EqChip(label: error.tagLabel, tone: EqChipTone.accent),
            SizedBox(height: EqSpacing.md),
            Text.rich(
              TextSpan(
                style: EqTextStyles.bodyMd(dark: dark).copyWith(color: onSurface),
                children: _correctionSpans(dark, onSurface),
              ),
            ),
            SizedBox(height: EqSpacing.sm),
            Text(error.explanation, style: EqTextStyles.bodyMd(dark: dark).copyWith(color: onSurfaceVariant)),
          ],
        ),
      ),
    );
  }

  List<InlineSpan> _correctionSpans(bool dark, Color onSurface) {
    final primary = dark ? EqDarkColors.primary : EqLightColors.primary;
    final spans = <InlineSpan>[];
    for (var i = 0; i < error.correctionSegments.length; i++) {
      final segment = error.correctionSegments[i];
      if (i > 0) spans.add(const TextSpan(text: ' '));
      spans.add(
        TextSpan(
          text: segment.text,
          style: segment.changed
              ? EqTextStyles.bodyMd(dark: dark).copyWith(color: primary, fontWeight: FontWeight.bold, decoration: TextDecoration.underline)
              : null,
        ),
      );
    }
    return spans;
  }
}
