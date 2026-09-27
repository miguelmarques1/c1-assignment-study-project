import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

/// The colour roles and type steps the lesson screens use, resolved once for
/// the current brightness so each widget doesn't repeat the light/dark pick.
class LessonPalette {
  LessonPalette.of(BuildContext context) : dark = Theme.of(context).brightness == Brightness.dark;

  final bool dark;

  Color get onSurface => dark ? EqDarkColors.onSurface : EqLightColors.onSurface;
  Color get onSurfaceVariant => dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant;
  Color get primary => dark ? EqDarkColors.primary : EqLightColors.primary;
  Color get tertiary => dark ? EqDarkColors.tertiary : EqLightColors.tertiary;
  Color get error => dark ? EqDarkColors.error : EqLightColors.error;
  Color get warning => dark ? EqDarkColors.badgeWarningFg : EqLightColors.badgeWarningFg;
  Color get outlineStrong => dark ? EqDarkColors.outlineStrong : EqLightColors.outlineStrong;
  Color get outlineVariant => dark ? EqDarkColors.outlineVariant : EqLightColors.outlineVariant;
  Color get surfaceContainer => dark ? EqDarkColors.surfaceContainer : EqLightColors.surfaceContainer;
  Color get surfaceContainerHighest =>
      dark ? EqDarkColors.surfaceContainerHighest : EqLightColors.surfaceContainerHighest;
  Color get surfaceContainerLowest =>
      dark ? EqDarkColors.surfaceContainerLowest : EqLightColors.surfaceContainerLowest;
  Color get primaryContainer => dark ? EqDarkColors.primaryContainer : EqLightColors.primaryContainer;
  Color get dangerBg => dark ? EqDarkColors.badgeDangerBg : EqLightColors.badgeDangerBg;
  Color get infoBg => dark ? EqDarkColors.badgeInfoBg : EqLightColors.badgeInfoBg;
  Color get infoFg => dark ? EqDarkColors.badgeInfoFg : EqLightColors.badgeInfoFg;

  TextStyle get headline => EqTextStyles.headlineSm(dark: dark);
  TextStyle get title => EqTextStyles.titleMd(dark: dark);
  TextStyle get titleLg => EqTextStyles.titleLg(dark: dark);
  TextStyle get body => EqTextStyles.bodyMd(dark: dark);
  TextStyle get bodyLg => EqTextStyles.bodyLg(dark: dark);
  TextStyle get bodySm => EqTextStyles.bodySm(dark: dark).copyWith(color: onSurfaceVariant);
  TextStyle get label => EqTextStyles.labelMd(dark: dark);
  TextStyle get labelLg => EqTextStyles.labelLg(dark: dark);
  TextStyle get labelSm => EqTextStyles.labelSm(dark: dark);

  BoxDecoration outlined({Color? color, double radius = EqRadius.lg, bool shadow = true}) => BoxDecoration(
    color: color ?? surfaceContainerLowest,
    borderRadius: BorderRadius.circular(radius),
    border: Border.all(color: outlineStrong, width: 2),
    boxShadow: shadow ? EqElevation.card(dark: dark) : null,
  );
}
