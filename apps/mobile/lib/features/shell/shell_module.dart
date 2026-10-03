import 'package:flutter_modular/flutter_modular.dart';

import '../../core/session/session_controller.dart';
import '../../core/session/session_state.dart';
import '../lessons/lessons_module.dart';
import '../plan/plan_module.dart';
import '../profile/profile_page.dart';
import '../settings/settings_module.dart';
import '../speaking/speaking_module.dart';
import '../today/today_page.dart';
import 'shell_page.dart';

/// The guard sits on the parent `/app` route: it decides once, before the
/// shell frame ever mounts, so every child destination is protected without
/// repeating the same check five times.
final shellModule = createModule(
  path: '/app',
  register: (c) {
    c.route(
      '/',
      guards: [
        (state) => inject<SessionController>().state.value is Authenticated ? null : '/login',
      ],
      child: (ctx, state) => const ShellPage(),
      children: (sub) {
        sub
          ..route('/today', child: (ctx, state) => const TodayPage())
          ..route('/profile', child: (ctx, state) => const ProfilePage())
          ..module(lessonsModule)
          ..module(planModule)
          ..module(settingsModule)
          ..module(speakingModule);
      },
    );
  },
);
