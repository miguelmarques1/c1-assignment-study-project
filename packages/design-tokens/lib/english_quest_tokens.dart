// GENERATED FILE — do not edit by hand.
// Source: packages/design-tokens/tokens.json
// Regenerate with `pnpm tokens:build`.

import 'package:flutter/material.dart';

class EqLightColors {
  static const Color surface = Color(0xFFFBF8FC);
  static const Color surfaceContainerLowest = Color(0xFFFFFFFF);
  static const Color surfaceContainer = Color(0xFFF0EDF1);
  static const Color surfaceContainerHighest = Color(0xFFE4E1E6);
  static const Color onSurface = Color(0xFF1B1B1E);
  static const Color onSurfaceVariant = Color(0xFF59413C);
  static const Color outline = Color(0xFF8D716A);
  static const Color outlineVariant = Color(0xFFE1BFB8);
  static const Color outlineStrong = Color(0xFF18181B);
  static const Color primary = Color(0xFFAE3115);
  static const Color onPrimary = Color(0xFFFFFFFF);
  static const Color primaryContainer = Color(0xFFFF6B4A);
  static const Color onPrimaryContainer = Color(0xFF18181B);
  static const Color secondary = Color(0xFF0058BE);
  static const Color onSecondary = Color(0xFFFFFFFF);
  static const Color tertiary = Color(0xFF006C49);
  static const Color error = Color(0xFFBA1A1A);
  static const Color onError = Color(0xFFFFFFFF);
  static const Color badgeSuccessBg = Color(0xFF00B07A);
  static const Color badgeSuccessFg = Color(0xFF003B26);
  static const Color badgeWarningBg = Color(0xFFFEF3C7);
  static const Color badgeWarningFg = Color(0xFF92400E);
  static const Color badgeInfoBg = Color(0xFFD8E2FF);
  static const Color badgeInfoFg = Color(0xFF001A42);
  static const Color badgeDangerBg = Color(0xFFFFDAD6);
  static const Color badgeDangerFg = Color(0xFF93000A);
  static const Color badgeNeutralBg = Color(0xFFE4E1E6);
  static const Color badgeNeutralFg = Color(0xFF1B1B1E);
}

class EqDarkColors {
  static const Color surface = Color(0xFF141316);
  static const Color surfaceContainerLowest = Color(0xFF1B1A1D);
  static const Color surfaceContainer = Color(0xFF211F23);
  static const Color surfaceContainerHighest = Color(0xFF2C2A2E);
  static const Color onSurface = Color(0xFFE5E1E6);
  static const Color onSurfaceVariant = Color(0xFFD8C2BC);
  static const Color outline = Color(0xFFA08D87);
  static const Color outlineVariant = Color(0xFF4A3530);
  static const Color outlineStrong = Color(0xFFE4E1E6);
  static const Color primary = Color(0xFFFFB4A3);
  static const Color onPrimary = Color(0xFF5F1500);
  static const Color primaryContainer = Color(0xFF7A2A12);
  static const Color onPrimaryContainer = Color(0xFFFFDAD2);
  static const Color secondary = Color(0xFFADC6FF);
  static const Color onSecondary = Color(0xFF002E69);
  static const Color tertiary = Color(0xFF4EDEA3);
  static const Color error = Color(0xFFFFB4AB);
  static const Color onError = Color(0xFF690005);
  static const Color badgeSuccessBg = Color(0xFF00513A);
  static const Color badgeSuccessFg = Color(0xFF6FFBBE);
  static const Color badgeWarningBg = Color(0xFF553F04);
  static const Color badgeWarningFg = Color(0xFFFDE68A);
  static const Color badgeInfoBg = Color(0xFF003C8F);
  static const Color badgeInfoFg = Color(0xFFD8E2FF);
  static const Color badgeDangerBg = Color(0xFF93000A);
  static const Color badgeDangerFg = Color(0xFFFFDAD6);
  static const Color badgeNeutralBg = Color(0xFF2C2A2E);
  static const Color badgeNeutralFg = Color(0xFFE5E1E6);
}

class EqSpacing {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 16;
  static const double lg = 24;
  static const double xl = 40;
  static const double gutter = 20;
  static const double gutterMobile = 12;
  static const double margin = 32;
  static const double marginMobile = 16;
}

class EqRadius {
  static const double sm = 4;
  static const double base = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double full = 9999;
}

class EqElevation {
  static List<BoxShadow> card({required bool dark}) => dark ? const <BoxShadow>[] : [BoxShadow(color: EqLightColors.outlineStrong, offset: const Offset(4, 4), blurRadius: 0)];
  static List<BoxShadow> button({required bool dark}) => dark ? const <BoxShadow>[] : [BoxShadow(color: EqLightColors.outlineStrong, offset: const Offset(3, 3), blurRadius: 0)];
  static List<BoxShadow> modal({required bool dark}) => dark ? const <BoxShadow>[] : [BoxShadow(color: EqLightColors.outlineStrong, offset: const Offset(6, 6), blurRadius: 0)];
  static List<BoxShadow> inputFocus({required bool dark}) => dark ? const <BoxShadow>[] : [BoxShadow(color: EqLightColors.outlineStrong, offset: const Offset(2, 2), blurRadius: 0)];
}

class EqTextStyles {
  static TextStyle display({required bool dark}) => TextStyle(
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 44,
    height: 1.1818,
    fontWeight: FontWeight.w800,
    color: dark ? EqDarkColors.onSurface : EqLightColors.onSurface,
  );
  static TextStyle displayMobile({required bool dark}) => TextStyle(
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 32,
    height: 1.2500,
    fontWeight: FontWeight.w800,
    color: dark ? EqDarkColors.onSurface : EqLightColors.onSurface,
  );
  static TextStyle headlineLg({required bool dark}) => TextStyle(
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 32,
    height: 1.2500,
    fontWeight: FontWeight.w700,
    color: dark ? EqDarkColors.onSurface : EqLightColors.onSurface,
  );
  static TextStyle headlineLgMobile({required bool dark}) => TextStyle(
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 26,
    height: 1.3077,
    fontWeight: FontWeight.w700,
    color: dark ? EqDarkColors.onSurface : EqLightColors.onSurface,
  );
  static TextStyle headlineMd({required bool dark}) => TextStyle(
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 24,
    height: 1.3333,
    fontWeight: FontWeight.w700,
    color: dark ? EqDarkColors.onSurface : EqLightColors.onSurface,
  );
  static TextStyle headlineSm({required bool dark}) => TextStyle(
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 20,
    height: 1.4000,
    fontWeight: FontWeight.w700,
    color: dark ? EqDarkColors.onSurface : EqLightColors.onSurface,
  );
  static TextStyle titleLg({required bool dark}) => TextStyle(
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 18,
    height: 1.4444,
    fontWeight: FontWeight.w600,
    color: dark ? EqDarkColors.onSurface : EqLightColors.onSurface,
  );
  static TextStyle titleMd({required bool dark}) => TextStyle(
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 16,
    height: 1.5000,
    fontWeight: FontWeight.w600,
    color: dark ? EqDarkColors.onSurface : EqLightColors.onSurface,
  );
  static TextStyle bodyLg({required bool dark}) => TextStyle(
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 16,
    height: 1.6250,
    fontWeight: FontWeight.w400,
    color: dark ? EqDarkColors.onSurface : EqLightColors.onSurface,
  );
  static TextStyle bodyMd({required bool dark}) => TextStyle(
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 14,
    height: 1.5714,
    fontWeight: FontWeight.w400,
    color: dark ? EqDarkColors.onSurface : EqLightColors.onSurface,
  );
  static TextStyle bodySm({required bool dark}) => TextStyle(
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 12,
    height: 1.5000,
    fontWeight: FontWeight.w500,
    color: dark ? EqDarkColors.onSurface : EqLightColors.onSurface,
  );
  static TextStyle labelLg({required bool dark}) => TextStyle(
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 14,
    height: 1.4286,
    fontWeight: FontWeight.w700,
    color: dark ? EqDarkColors.onSurface : EqLightColors.onSurface,
  );
  static TextStyle labelMd({required bool dark}) => TextStyle(
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 12,
    height: 1.3333,
    fontWeight: FontWeight.w700,
    color: dark ? EqDarkColors.onSurface : EqLightColors.onSurface,
  );
  static TextStyle labelSm({required bool dark}) => TextStyle(
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 11,
    height: 1.2727,
    fontWeight: FontWeight.w800,
    color: dark ? EqDarkColors.onSurface : EqLightColors.onSurface,
  );
}

ThemeData eqLightTheme() {
  return ThemeData(
    brightness: Brightness.light,
    scaffoldBackgroundColor: EqLightColors.surface,
    fontFamily: 'Plus Jakarta Sans',
    colorScheme: ColorScheme.light(
      primary: EqLightColors.primary,
      onPrimary: EqLightColors.onPrimary,
      secondary: EqLightColors.secondary,
      onSecondary: EqLightColors.onSecondary,
      error: EqLightColors.error,
      onError: EqLightColors.onError,
      surface: EqLightColors.surface,
      onSurface: EqLightColors.onSurface,
    ),
  );
}

ThemeData eqDarkTheme() {
  return ThemeData(
    brightness: Brightness.dark,
    scaffoldBackgroundColor: EqDarkColors.surface,
    fontFamily: 'Plus Jakarta Sans',
    colorScheme: ColorScheme.dark(
      primary: EqDarkColors.primary,
      onPrimary: EqDarkColors.onPrimary,
      secondary: EqDarkColors.secondary,
      onSecondary: EqDarkColors.onSecondary,
      error: EqDarkColors.error,
      onError: EqDarkColors.onError,
      surface: EqDarkColors.surface,
      onSurface: EqDarkColors.onSurface,
    ),
  );
}
