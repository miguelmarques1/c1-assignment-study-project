import 'package:flutter_modular/flutter_modular.dart';

import '../progress/progress_page.dart';
import 'profile_page.dart';

/// The Profile tab (F12): the learning profile, with the progress dashboard
/// (F20) pushed on top, so the bottom navigation stays in place and the tab
/// stays selected on the sub-path. Same pattern as the Plan and Lessons tabs.
final profileModule = createModule(
  path: '/profile',
  register: (c) {
    c
      ..route('/', child: (ctx, state) => const ProfilePage())
      ..route('/progress', child: (ctx, state) => const ProgressPage());
  },
);
