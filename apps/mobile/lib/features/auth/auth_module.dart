import 'package:flutter_modular/flutter_modular.dart';

import '../../core/session/session_controller.dart';
import '../../core/session/session_state.dart';
import 'login_page.dart';

final authModule = createModule(
  path: '/login',
  register: (c) {
    c.route(
      '/',
      guards: [
        (state) => inject<SessionController>().state.value is Authenticated ? '/app/today' : null,
      ],
      child: (ctx, state) => const LoginPage(),
    );
  },
);
