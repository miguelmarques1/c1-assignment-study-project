import 'package:flutter/material.dart';
import 'package:flutter_modular/flutter_modular.dart';

import 'design/eq_theme.dart';

class AppWidget extends StatelessWidget {
  const AppWidget({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'English Quest',
      theme: EqTheme.light(),
      darkTheme: EqTheme.dark(),
      themeMode: EqTheme.mode,
      routerConfig: ModularApp.routerConfigOf(context),
    );
  }
}
