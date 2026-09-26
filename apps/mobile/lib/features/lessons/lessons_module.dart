import 'package:flutter_modular/flutter_modular.dart';

import 'lesson_detail_page.dart';
import 'lessons_page.dart';

/// The Lessons tab (F19): the history list, and a lesson's detail pushed on
/// top of it inside the tab, so the bottom navigation stays in place.
final lessonsModule = createModule(
  path: '/lessons',
  register: (c) {
    c
      ..route('/', child: (ctx, state) => const LessonsPage())
      ..route('/:lessonId', child: (ctx, state) => LessonDetailPage(lessonId: state.params['lessonId']!));
  },
);
