import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

/// Mirrors `apps/web/src/components/ui/button.tsx`'s variant vocabulary —
/// same four names, same colour-role mapping.
enum EqButtonVariant { primary, secondary, neutral, destructive }

enum EqButtonSize { sm, md, lg }

class EqButton extends StatelessWidget {
  const EqButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = EqButtonVariant.primary,
    this.size = EqButtonSize.md,
    this.loading = false,
    this.loadingLabel = 'Working…',
  });

  final String label;
  final VoidCallback? onPressed;
  final EqButtonVariant variant;
  final EqButtonSize size;
  final bool loading;
  final String loadingLabel;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final (background, foreground) = _colorsFor(variant, dark);
    final (horizontal, vertical, textStyle) = _dimensionsFor(size, dark, foreground);
    final disabled = onPressed == null || loading;

    return Opacity(
      opacity: disabled ? 0.6 : 1,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadius.circular(EqRadius.md),
          border: Border.all(
            color: dark ? EqDarkColors.outlineStrong : EqLightColors.outlineStrong,
            width: 2,
          ),
          boxShadow: EqElevation.button(dark: dark),
        ),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: BorderRadius.circular(EqRadius.md),
            onTap: disabled ? null : onPressed,
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: horizontal, vertical: vertical),
              child: Semantics(
                liveRegion: true,
                child: Text(loading ? loadingLabel : label, style: textStyle, textAlign: TextAlign.center),
              ),
            ),
          ),
        ),
      ),
    );
  }

  (Color, Color) _colorsFor(EqButtonVariant variant, bool dark) {
    switch (variant) {
      case EqButtonVariant.primary:
        return dark
            ? (EqDarkColors.primary, EqDarkColors.onPrimary)
            : (EqLightColors.primary, EqLightColors.onPrimary);
      case EqButtonVariant.secondary:
        return dark
            ? (EqDarkColors.secondary, EqDarkColors.onSecondary)
            : (EqLightColors.secondary, EqLightColors.onSecondary);
      case EqButtonVariant.neutral:
        return dark
            ? (EqDarkColors.surfaceContainerLowest, EqDarkColors.onSurface)
            : (EqLightColors.surfaceContainerLowest, EqLightColors.onSurface);
      case EqButtonVariant.destructive:
        return dark ? (EqDarkColors.error, EqDarkColors.onError) : (EqLightColors.error, EqLightColors.onError);
    }
  }

  (double, double, TextStyle) _dimensionsFor(EqButtonSize size, bool dark, Color foreground) {
    switch (size) {
      case EqButtonSize.sm:
        return (EqSpacing.sm, EqSpacing.xs, EqTextStyles.labelMd(dark: dark).copyWith(color: foreground));
      case EqButtonSize.md:
        return (EqSpacing.md, EqSpacing.sm, EqTextStyles.labelLg(dark: dark).copyWith(color: foreground));
      case EqButtonSize.lg:
        return (EqSpacing.lg, EqSpacing.sm, EqTextStyles.titleMd(dark: dark).copyWith(color: foreground));
    }
  }
}
