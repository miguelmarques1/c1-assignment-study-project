import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

/// Mirrors `apps/web/src/components/ui/card.tsx`'s tone vocabulary.
enum EqCardTone { neutral, primary, info, success }

/// 2px outline plus the offset-shadow treatment from [EqElevation.card].
class EqCard extends StatelessWidget {
  const EqCard({
    super.key,
    required this.child,
    this.tone = EqCardTone.neutral,
    this.header,
    this.footer,
  });

  final Widget child;
  final EqCardTone tone;
  final Widget? header;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final (background, foreground) = _colorsFor(tone, dark);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(EqRadius.lg),
        border: Border.all(
          color: dark ? EqDarkColors.outlineStrong : EqLightColors.outlineStrong,
          width: 2,
        ),
        boxShadow: EqElevation.card(dark: dark),
      ),
      child: Padding(
        padding: EdgeInsets.all(EqSpacing.lg),
        child: DefaultTextStyle.merge(
          style: TextStyle(color: foreground),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (header != null) Padding(padding: EdgeInsets.only(bottom: EqSpacing.md), child: header),
              child,
              if (footer != null) Padding(padding: EdgeInsets.only(top: EqSpacing.md), child: footer),
            ],
          ),
        ),
      ),
    );
  }

  (Color, Color) _colorsFor(EqCardTone tone, bool dark) {
    switch (tone) {
      case EqCardTone.neutral:
        return dark
            ? (EqDarkColors.surfaceContainerLowest, EqDarkColors.onSurface)
            : (EqLightColors.surfaceContainerLowest, EqLightColors.onSurface);
      case EqCardTone.primary:
        return dark
            ? (EqDarkColors.primaryContainer, EqDarkColors.onPrimaryContainer)
            : (EqLightColors.primaryContainer, EqLightColors.onPrimaryContainer);
      case EqCardTone.info:
        return dark
            ? (EqDarkColors.badgeInfoBg, EqDarkColors.badgeInfoFg)
            : (EqLightColors.badgeInfoBg, EqLightColors.badgeInfoFg);
      case EqCardTone.success:
        return dark
            ? (EqDarkColors.badgeSuccessBg, EqDarkColors.badgeSuccessFg)
            : (EqLightColors.badgeSuccessBg, EqLightColors.badgeSuccessFg);
    }
  }
}
