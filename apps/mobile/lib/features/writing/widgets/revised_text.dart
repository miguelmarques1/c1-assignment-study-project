import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../writing_models.dart';

/// Renders the revision segments as continuous prose, with changed spans in
/// `font-bold text-primary` and underlined, as the result's error cards do
/// (spec §4). A visually hidden legend explains the emphasis.
class RevisedText extends StatelessWidget {
  const RevisedText({super.key, required this.segments});

  final List<WritingRevisionSegment> segments;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final onSurface = dark ? EqDarkColors.onSurface : EqLightColors.onSurface;
    final primary = dark ? EqDarkColors.primary : EqLightColors.primary;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text.rich(
          TextSpan(
            children: [
              for (final segment in segments)
                TextSpan(
                  text: segment.text,
                  style: segment.changed
                      ? EqTextStyles.bodyMd(dark: dark).copyWith(color: primary, fontWeight: FontWeight.bold, decoration: TextDecoration.underline)
                      : EqTextStyles.bodyMd(dark: dark).copyWith(color: onSurface),
                ),
            ],
          ),
        ),
        Semantics(
          label: 'Bold, underlined text marks what changed from your original submission.',
          child: const SizedBox.shrink(),
        ),
      ],
    );
  }
}
