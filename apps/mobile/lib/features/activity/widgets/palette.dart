import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

/// The colour roles the runner's widgets use, resolved once per theme so each
/// widget reads `palette.outline` rather than repeating the light/dark switch.
class EqPalette {
  const EqPalette._(this.dark);

  factory EqPalette.of(BuildContext context) => EqPalette._(Theme.of(context).brightness == Brightness.dark);

  final bool dark;

  Color get outline => dark ? EqDarkColors.outlineStrong : EqLightColors.outlineStrong;
  Color get surface => dark ? EqDarkColors.surface : EqLightColors.surface;
  Color get surfaceLowest => dark ? EqDarkColors.surfaceContainerLowest : EqLightColors.surfaceContainerLowest;
  Color get surfaceHighest => dark ? EqDarkColors.surfaceContainerHighest : EqLightColors.surfaceContainerHighest;
  Color get onSurface => dark ? EqDarkColors.onSurface : EqLightColors.onSurface;
  Color get onSurfaceVariant => dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant;
  Color get primary => dark ? EqDarkColors.primary : EqLightColors.primary;
  Color get onPrimary => dark ? EqDarkColors.onPrimary : EqLightColors.onPrimary;
  Color get primaryContainer => dark ? EqDarkColors.primaryContainer : EqLightColors.primaryContainer;
  Color get onPrimaryContainer => dark ? EqDarkColors.onPrimaryContainer : EqLightColors.onPrimaryContainer;
  Color get secondary => dark ? EqDarkColors.secondary : EqLightColors.secondary;
  Color get onSecondary => dark ? EqDarkColors.onSecondary : EqLightColors.onSecondary;
  Color get error => dark ? EqDarkColors.error : EqLightColors.error;
  Color get infoBg => dark ? EqDarkColors.badgeInfoBg : EqLightColors.badgeInfoBg;
  Color get infoFg => dark ? EqDarkColors.badgeInfoFg : EqLightColors.badgeInfoFg;
  Color get warningBg => dark ? EqDarkColors.badgeWarningBg : EqLightColors.badgeWarningBg;
  Color get warningFg => dark ? EqDarkColors.badgeWarningFg : EqLightColors.badgeWarningFg;
  Color get dangerBg => dark ? EqDarkColors.badgeDangerBg : EqLightColors.badgeDangerBg;
  Color get dangerFg => dark ? EqDarkColors.badgeDangerFg : EqLightColors.badgeDangerFg;

  /// A bordered, rounded box: the surface every runner panel is built on.
  BoxDecoration box({Color? color, double radius = EqRadius.lg, bool shadow = false}) => BoxDecoration(
    color: color ?? surfaceLowest,
    borderRadius: BorderRadius.circular(radius),
    border: Border.all(color: outline, width: 2),
    boxShadow: shadow ? EqElevation.card(dark: dark) : const [],
  );
}
