import 'package:flutter_modular/flutter_modular.dart';

import '../writing/writing_page.dart';
import 'plan_detail_page.dart';
import 'plan_history_page.dart';
import 'plan_page.dart';

/// The Plan tab (F15): the current plan, its history pushed on top, and a
/// past plan's detail pushed on top of that — same pattern as the Lessons
/// tab, so the bottom navigation stays in place. A writing activity's runner
/// (F17) nests here too, so it keeps the Plan pill active (spec A21) — its
/// route is declared before `/:planId`, whose catch-all would otherwise
/// swallow it.
final planModule = createModule(
  path: '/plan',
  register: (c) {
    c
      ..route('/', child: (ctx, state) => const PlanPage())
      ..route('/history', child: (ctx, state) => const PlanHistoryPage())
      ..route('/activities/:activityId/writing', child: (ctx, state) => WritingPage(activityId: state.params['activityId']!))
      ..route('/:planId', child: (ctx, state) => PlanDetailPage(planId: state.params['planId']!));
  },
);
