import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/design/widgets/eq_page_state.dart';
import 'package:mobile/features/plan/plan_detail_page.dart';
import 'package:mobile/features/plan/plan_history_page.dart';
import 'package:mobile/features/plan/plans_api.dart';

import '../../helpers/pump_screen.dart';
import '../../helpers/scripted_dio.dart';
import 'fixtures.dart';

Future<ScriptedAdapter> _pumpHistory(
  WidgetTester tester,
  Map<String, Responder> responders, {
  void Function(String planId)? onOpenPlan,
}) async {
  final (dio, adapter) = scriptedDio(responders);
  final page = PlanHistoryPage(key: UniqueKey(), api: PlansApi(dio), onOpenPlan: onOpenPlan ?? (_) {});
  await pumpOnSmallPhone(tester, page);
  return adapter;
}

Future<ScriptedAdapter> _pumpDetail(
  WidgetTester tester,
  Map<String, Responder> responders,
  String planId, {
  VoidCallback? onRedirect,
}) async {
  final (dio, adapter) = scriptedDio(responders);
  final page = PlanDetailPage(key: UniqueKey(), planId: planId, api: PlansApi(dio), onRedirectToCurrent: onRedirect ?? () {});
  await pumpOnSmallPhone(tester, page);
  return adapter;
}

void main() {
  group('PlanHistoryPage', () {
    testWidgets('lists_previous_plans_marking_the_active_one_current_and_opening_a_row', (tester) async {
      String? opened;
      await _pumpHistory(tester, {
        'GET /plans': ok({
          'plans': [historyItemJson(id: 'active-plan', status: 'active'), historyItemJson(id: 'archived-plan')],
        }),
      }, onOpenPlan: (id) => opened = id);

      expect(find.text('CURRENT'), findsOneWidget);
      expect(find.textContaining('12 of 19 completed'), findsWidgets);

      await tester.tap(find.textContaining('12 of 19 completed').first);
      expect(opened, isNotNull);
    });

    testWidgets('shows_an_empty_state_with_no_previous_plans', (tester) async {
      await _pumpHistory(tester, {
        'GET /plans': ok({'plans': []}),
      });
      expect(find.text('No previous plans yet.'), findsOneWidget);
    });

    testWidgets('shows_an_error_state_when_the_read_fails', (tester) async {
      await _pumpHistory(tester, {'GET /plans': failure(500, 'SYS001', 'Boom')});
      expect(find.byType(EqError), findsOneWidget);
    });
  });

  group('PlanDetailPage', () {
    testWidgets('shows_the_origin_and_date_with_no_archived_line_for_an_unarchived_plan', (tester) async {
      await _pumpDetail(tester, {
        'GET /plans/current': ok(currentJson()),
        'GET /plans/archived-plan': ok(planJson()),
      }, 'archived-plan');

      expect(find.textContaining('From lesson ·'), findsOneWidget);
      expect(find.textContaining('Archived'), findsNothing);
    });

    testWidgets('shows_when_the_plan_was_archived', (tester) async {
      await _pumpDetail(tester, {
        'GET /plans/current': ok(currentJson()),
        'GET /plans/archived-plan': ok(planJson()..['archivedAt'] = '2026-09-18T10:00:00.000Z'),
      }, 'archived-plan');

      expect(find.textContaining('Archived'), findsOneWidget);
    });

    testWidgets('redirects_when_the_id_is_the_active_plan', (tester) async {
      var redirected = false;
      await _pumpDetail(tester, {
        'GET /plans/current': ok(currentJson(plan: planJson())),
      }, 'plan-1', onRedirect: () => redirected = true);
      await tester.pumpAndSettle();

      expect(redirected, isTrue);
    });
  });
}
