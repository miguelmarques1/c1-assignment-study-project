import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

/// Mirrors `apps/web/src/components/ui/chip.tsx`'s five tones.
enum EqChipTone { neutral, accent, success, warning, danger }

/// A rounded label with an optional recurrence [count] (`×3`), as the web's
/// `Chip`. Never interactive by itself: a tappable chip is wrapped by its
/// owner, which also gives it its semantics.
class EqChip extends StatelessWidget {
  const EqChip({super.key, required this.label, this.tone = EqChipTone.neutral, this.count});

  final String label;
  final EqChipTone tone;
  final int? count;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final (background, foreground) = _colorsFor(tone, dark);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(EqRadius.full),
        border: Border.all(color: dark ? EqDarkColors.outlineStrong : EqLightColors.outlineStrong, width: 2),
      ),
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: EqSpacing.sm, vertical: EqSpacing.xs),
        child: Text.rich(
          TextSpan(
            text: label,
            style: EqTextStyles.labelMd(dark: dark).copyWith(color: foreground),
            children: [
              if (count != null)
                TextSpan(text: ' ×$count', style: EqTextStyles.labelSm(dark: dark).copyWith(color: foreground)),
            ],
          ),
        ),
      ),
    );
  }

  (Color, Color) _colorsFor(EqChipTone tone, bool dark) {
    switch (tone) {
      case EqChipTone.neutral:
        return dark
            ? (EqDarkColors.surfaceContainer, EqDarkColors.onSurface)
            : (EqLightColors.surfaceContainer, EqLightColors.onSurface);
      case EqChipTone.accent:
        return dark
            ? (EqDarkColors.primaryContainer, EqDarkColors.onPrimaryContainer)
            : (EqLightColors.primaryContainer, EqLightColors.onPrimaryContainer);
      case EqChipTone.success:
        return dark
            ? (EqDarkColors.badgeSuccessBg, EqDarkColors.badgeSuccessFg)
            : (EqLightColors.badgeSuccessBg, EqLightColors.badgeSuccessFg);
      case EqChipTone.warning:
        return dark
            ? (EqDarkColors.badgeWarningBg, EqDarkColors.badgeWarningFg)
            : (EqLightColors.badgeWarningBg, EqLightColors.badgeWarningFg);
      case EqChipTone.danger:
        return dark
            ? (EqDarkColors.badgeDangerBg, EqDarkColors.badgeDangerFg)
            : (EqLightColors.badgeDangerBg, EqLightColors.badgeDangerFg);
    }
  }
}
