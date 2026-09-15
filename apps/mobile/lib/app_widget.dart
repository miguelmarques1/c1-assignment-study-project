import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_modular/flutter_modular.dart';

/// Light is the default theme, matching F21's policy — the dark variant is
/// wired in once eq_theme.dart lands in Stage 4.
class AppWidget extends StatelessWidget {
  const AppWidget({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'English Quest',
      theme: eqLightTheme(),
      routerConfig: ModularApp.routerConfigOf(context),
    );
  }
}
