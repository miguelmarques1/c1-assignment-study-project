import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

/// Binds the app's `ThemeData` to the generated token package. Light is the
/// default regardless of OS preference — the same policy F21 set for web —
/// so `themeMode` is pinned rather than left at `ThemeMode.system`.
class EqTheme {
  const EqTheme._();

  static ThemeData light() => eqLightTheme();
  static ThemeData dark() => eqDarkTheme();
  static const ThemeMode mode = ThemeMode.light;
}
