import 'package:flutter_modular/flutter_modular.dart';

import '../../core/session/session_controller.dart';
import '../../core/session/session_state.dart';
import 'activity_runner_page.dart';

/// `/activity/:activityId` — the objective runner, mounted at the app root
/// outside the `/app` shell so it is full-screen with no bottom navigation
/// (A21), behind the same session guard as the shell.
final activityModule = createModule(
  path: '/activity',
  register: (c) {
    c.route(
      '/:activityId',
      guards: [(state) => inject<SessionController>().state.value is Authenticated ? null : '/login'],
      child: (ctx, state) => ActivityRunnerPage(activityId: state.params['activityId']!),
    );
  },
);
