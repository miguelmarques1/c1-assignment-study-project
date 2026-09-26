import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

/// Binds the app's `ThemeData` to the generated token package. Light is the
/// default regardless of OS preference — the same policy F21 set for web —
/// so `themeMode` is pinned rather than left at `ThemeMode.system`.
class EqTheme {
  const EqTheme._();

  static ThemeData light() => _withComponents(eqLightTheme(), dark: false);
  static ThemeData dark() => _withComponents(eqDarkTheme(), dark: true);
  static const ThemeMode mode = ThemeMode.light;

  static ThemeData _withComponents(ThemeData base, {required bool dark}) {
    return base.copyWith(tabBarTheme: _tabBarTheme(dark: dark));
  }

  /// The lesson detail's section tabs (F19): the web's `NavPill` look — the
  /// active tab is an outlined card, the rest plain labels — with no Material
  /// underline, tint or ripple.
  static TabBarThemeData _tabBarTheme({required bool dark}) {
    final onSurface = dark ? EqDarkColors.onSurface : EqLightColors.onSurface;
    return TabBarThemeData(
      indicator: BoxDecoration(
        color: dark ? EqDarkColors.surfaceContainerLowest : EqLightColors.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(EqRadius.md),
        border: Border.all(color: dark ? EqDarkColors.outlineStrong : EqLightColors.outlineStrong, width: 2),
      ),
      indicatorSize: TabBarIndicatorSize.tab,
      dividerColor: Colors.transparent,
      labelColor: onSurface,
      unselectedLabelColor: dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant,
      labelStyle: EqTextStyles.labelLg(dark: dark),
      unselectedLabelStyle: EqTextStyles.labelLg(dark: dark),
      labelPadding: EdgeInsets.symmetric(horizontal: EqSpacing.md),
      overlayColor: const WidgetStatePropertyAll(Colors.transparent),
      splashFactory: NoSplash.splashFactory,
      tabAlignment: TabAlignment.start,
    );
  }
}
