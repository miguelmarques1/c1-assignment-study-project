import 'package:flutter_modular/flutter_modular.dart';

import 'settings_page.dart';

final settingsModule = createModule(
  path: '/settings',
  register: (c) {
    c.route('/', child: (ctx, state) => const SettingsPage());
  },
);
