import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/design/widgets/eq_page_state.dart';
import 'package:mobile/features/plan/plan_page.dart';
import 'package:mobile/features/plan/plans_api.dart';

import '../../helpers/pump_screen.dart';
import '../../helpers/scripted_dio.dart';
import 'fixtures.dart';

Future<ScriptedAdapter> _pump(
  WidgetTester tester,
  Map<String, Responder> responders, {
  double textScale = 1,
  void Function(String path)? onOpen,
}) async {
  final (dio, adapter) = scriptedDio(responders);
  final page = PlanPage(key: UniqueKey(), api: PlansApi(dio), onOpenActivity: onOpen ?? (_) {});
  await pumpOnSmallPhone(tester, page, textScale: textScale);
  return adapter;
}

void main() {
  group('PlanPage', () {
    testWidgets('shows_the_empty_state_when_there_is_no_plan_yet', (tester) async {
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

      expect(find.text('Preparing your plan…'), findsOneWidget);
      expect(find.text('4 of 12'), findsOneWidget);
    });

    testWidgets('shows_the_failure_message_and_retries_it', (tester) async {
      final adapter = await _pump(tester, {
        'GET /plans/current': ok(
          currentJson(
            failure: {
              'lessonId': 'l1',
              'origin': 'lesson',
              'failedAt': '2026-09-25T13:00:00.000Z',
              'message': 'We could not build a new plan.',
              'retryable': true,
            },
          ),
        ),
        'POST /plans/retry': ok(currentJson()),
      });

      expect(find.text('We could not build a new plan.'), findsOneWidget);
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(adapter.requests.where((r) => r.method == 'POST'), hasLength(1));
    });

    testWidgets('renders_the_summary_and_all_seven_days', (tester) async {
      await _pump(tester, {'GET /plans/current': ok(currentJson(plan: planJson()))});

      expect(find.text('7 sessions · 7 activities'), findsOneWidget);
      for (var day = 1; day <= 7; day++) {
        expect(find.textContaining('Day $day ·'), findsOneWidget, reason: 'day $day');
      }
    });

    testWidgets('opens_previous_plans', (tester) async {
      String? opened;
      await _pump(tester, {'GET /plans/current': ok(currentJson())}, onOpen: (path) => opened = path);

      await tester.tap(find.text('Previous plans'));
      await tester.pumpAndSettle();
      expect(opened, '/app/plan/history');
    });

    testWidgets('list_fits_a_small_phone_and_large_text', (tester) async {
      await _pump(tester, {'GET /plans/current': ok(currentJson(plan: planJson()))});
      expect(tester.takeException(), isNull);
      await _pump(tester, {'GET /plans/current': ok(currentJson(plan: planJson()))}, textScale: 1.3);
      expect(tester.takeException(), isNull);
    });

    testWidgets('shows_an_error_state_when_the_read_fails', (tester) async {
      await _pump(tester, {'GET /plans/current': failure(500, 'SYS001', 'Boom')});
      expect(find.byType(EqError), findsOneWidget);
    });
  });
}
