import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/plan/plans_api.dart';
import 'package:mobile/features/settings/credentials_controller.dart';
import 'package:mobile/features/today/today_page.dart';

import '../../helpers/pump_screen.dart';
import '../../helpers/scripted_dio.dart';
import '../plan/fixtures.dart';

Future<ScriptedAdapter> _pump(
  WidgetTester tester,
  Map<String, Responder> responders, {
  double textScale = 1,
  VoidCallback? onSeeFullPlan,
}) async {
  final (dio, adapter) = scriptedDio({'GET /credentials': ok(<Map<String, Object?>>[]), ...responders});
  final page = TodayPage(
    key: UniqueKey(),
    api: PlansApi(dio),
    credentials: CredentialsController(dio),
    onSeeFullPlan: onSeeFullPlan ?? () {},
  );
  await pumpOnSmallPhone(tester, page, textScale: textScale);
  return adapter;
}

void main() {
  group('TodayPage', () {
    testWidgets('invites_opening_the_classroom_when_there_is_no_plan_yet', (tester) async {
      await _pump(tester, {'GET /plans/current': ok(currentJson())});
      expect(find.textContaining('Your study plan appears after your first lesson.'), findsOneWidget);
    });

    testWidgets('shows_preparing_progress', (tester) async {
      await _pump(tester, {
        'GET /plans/current': ok(
          currentJson(
            preparing: {
              'lessonId': 'l1',
              'origin': 'lesson',
              'since': '2026-09-25T13:00:00.000Z',
              'progress': {'done': 4, 'total': 12},
            },
          ),
        ),
      });
      expect(find.text('4 of 12'), findsOneWidget);
    });

    testWidgets('lists_the_current_sessions_activities_and_sees_the_full_plan', (tester) async {
      bool? sawFullPlan = false;
      final plan = planJson();
      (plan['sessions'] as List)[2] = sessionJson(day: 3, state: 'in_progress');
      await _pump(tester, {'GET /plans/current': ok(currentJson(plan: plan))}, onSeeFullPlan: () => sawFullPlan = true);

      expect(find.textContaining('Day 3 ·'), findsOneWidget);
      // ACTIVITY_ROUTES is empty until F16-F18 register a kind, so no start button exists yet.
      expect(find.text('Start session'), findsNothing);

      await tester.tap(find.text('See the full plan'));
      expect(sawFullPlan, isTrue);
    });

    testWidgets('shows_the_completed_today_summary', (tester) async {
      final now = DateTime.now().toUtc().toIso8601String();
      final plan = planJson();
      final sessions = plan['sessions'] as List;
      sessions[0] = {
        ...sessionJson(day: 1, state: 'completed'),
        'completedAt': now,
        'summary': {'completed': 3, 'skipped': 0, 'correct': 8, 'questions': 10, 'timeSpentSeconds': 1080},
      };
      await _pump(tester, {'GET /plans/current': ok(currentJson(plan: plan))});

      expect(find.textContaining('3 activities completed'), findsOneWidget);
      expect(find.text('Work ahead in Plan'), findsOneWidget);
    });

    testWidgets('list_fits_a_small_phone_and_large_text', (tester) async {
      await _pump(tester, {'GET /plans/current': ok(currentJson(plan: planJson()))});
      expect(tester.takeException(), isNull);
      await _pump(tester, {'GET /plans/current': ok(currentJson(plan: planJson()))}, textScale: 1.3);
      expect(tester.takeException(), isNull);
    });
  });
}
