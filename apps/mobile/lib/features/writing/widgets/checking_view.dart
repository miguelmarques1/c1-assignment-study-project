import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

/// `Checking your writing…`, with the submitted text still visible (spec §4).
class CheckingView extends StatelessWidget {
  const CheckingView({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final onSurface = dark ? EqDarkColors.onSurface : EqLightColors.onSurface;
    final onSurfaceVariant = dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant;
    final outline = dark ? EqDarkColors.outlineStrong : EqLightColors.outlineStrong;
    final surface = dark ? EqDarkColors.surfaceContainer : EqLightColors.surfaceContainer;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2, color: dark ? EqDarkColors.primary : EqLightColors.primary),
            ),
            SizedBox(width: EqSpacing.sm),
            Expanded(child: Text('Checking your writing…', style: EqTextStyles.titleMd(dark: dark).copyWith(color: onSurface))),
          ],
        ),
        SizedBox(height: EqSpacing.md),
        Container(
          padding: EdgeInsets.all(EqSpacing.md),
          decoration: BoxDecoration(
            color: surface,
            borderRadius: BorderRadius.circular(EqRadius.md),
            border: Border.all(color: outline, width: 2),
          ),
          child: Text(text, style: EqTextStyles.bodyMd(dark: dark).copyWith(color: onSurfaceVariant)),
        ),
      ],
    );
  }
}
