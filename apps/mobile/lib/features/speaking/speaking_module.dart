import 'package:flutter_modular/flutter_modular.dart';

import 'speaking_page.dart';

/// `/app/speaking/:activityId` — the speaking and pronunciation runner,
/// mounted inside the shell like a lesson detail (F18).
final speakingModule = createModule(
  path: '/speaking',
  register: (c) {
    c.route('/:activityId', child: (ctx, state) => SpeakingPage(activityId: state.params['activityId']!));
  },
);
