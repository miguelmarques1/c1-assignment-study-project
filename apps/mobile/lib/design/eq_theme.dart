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
    return base.copyWith(
      tabBarTheme: _tabBarTheme(dark: dark),
      inputDecorationTheme: _inputDecorationTheme(dark: dark),
    );
  }

  /// A 2px-outlined field on a filled surface, matching the web `TextField`/
  /// `TextArea`'s look (F17) — no Material underline, no floating-label tint.
  /// A bare `TextField` across the app inherits this, which is `mobile-ui`'s
  /// "add the component theme" instruction rather than a one-off per screen.
  static InputDecorationTheme _inputDecorationTheme({required bool dark}) {
    final outline = dark ? EqDarkColors.outlineStrong : EqLightColors.outlineStrong;
    final surface = dark ? EqDarkColors.surfaceContainerLowest : EqLightColors.surfaceContainerLowest;
    final onSurfaceVariant = dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant;
    final error = dark ? EqDarkColors.error : EqLightColors.error;
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(EqRadius.md),
      borderSide: BorderSide(color: outline, width: 2),
    );
    final errorBorder = border.copyWith(borderSide: BorderSide(color: error, width: 2));

    return InputDecorationTheme(
      filled: true,
      fillColor: surface,
      border: border,
      enabledBorder: border,
      focusedBorder: border,
      disabledBorder: border,
      errorBorder: errorBorder,
      focusedErrorBorder: errorBorder,
      contentPadding: EdgeInsets.symmetric(horizontal: EqSpacing.md, vertical: EqSpacing.sm),
      labelStyle: EqTextStyles.labelMd(dark: dark).copyWith(color: onSurfaceVariant),
      floatingLabelStyle: EqTextStyles.labelMd(dark: dark).copyWith(color: onSurfaceVariant),
      hintStyle: EqTextStyles.bodyMd(dark: dark).copyWith(color: onSurfaceVariant),
      errorStyle: EqTextStyles.bodySm(dark: dark).copyWith(color: error),
    );
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
