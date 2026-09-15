import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

/// Mirrors `apps/web/src/components/ui/badge.tsx`'s five statuses.
enum EqBadgeStatus { success, warning, info, danger, neutral }

/// Always renders [label] — a badge that carried its status through colour
/// alone would be invisible to anyone who can't distinguish the hues.
class EqBadge extends StatelessWidget {
  const EqBadge({super.key, required this.status, required this.label});

  final EqBadgeStatus status;
  final String label;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final (background, foreground) = _colorsFor(status, dark);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(EqRadius.full),
        border: Border.all(
          color: dark ? EqDarkColors.outlineStrong : EqLightColors.outlineStrong,
          width: 2,
        ),
      ),
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: EqSpacing.sm, vertical: EqSpacing.xs),
        child: Text(
          label.toUpperCase(),
          style: EqTextStyles.labelSm(dark: dark).copyWith(color: foreground, letterSpacing: 0.5),
        ),
      ),
    );
  }

  (Color, Color) _colorsFor(EqBadgeStatus status, bool dark) {
    switch (status) {
      case EqBadgeStatus.success:
        return dark
            ? (EqDarkColors.badgeSuccessBg, EqDarkColors.badgeSuccessFg)
            : (EqLightColors.badgeSuccessBg, EqLightColors.badgeSuccessFg);
      case EqBadgeStatus.warning:
        return dark
            ? (EqDarkColors.badgeWarningBg, EqDarkColors.badgeWarningFg)
            : (EqLightColors.badgeWarningBg, EqLightColors.badgeWarningFg);
      case EqBadgeStatus.info:
        return dark
            ? (EqDarkColors.badgeInfoBg, EqDarkColors.badgeInfoFg)
            : (EqLightColors.badgeInfoBg, EqLightColors.badgeInfoFg);
      case EqBadgeStatus.danger:
        return dark
            ? (EqDarkColors.badgeDangerBg, EqDarkColors.badgeDangerFg)
            : (EqLightColors.badgeDangerBg, EqLightColors.badgeDangerFg);
      case EqBadgeStatus.neutral:
        return dark
            ? (EqDarkColors.badgeNeutralBg, EqDarkColors.badgeNeutralFg)
            : (EqLightColors.badgeNeutralBg, EqLightColors.badgeNeutralFg);
    }
  }
}
