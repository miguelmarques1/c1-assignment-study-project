import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/design/eq_theme.dart';
import 'package:mobile/design/widgets/eq_button.dart';
import 'package:mobile/features/profile/profile_controller.dart';
import 'package:mobile/features/writing/writing_api.dart';
import 'package:mobile/features/writing/writing_draft_store.dart';
import 'package:mobile/features/writing/writing_models.dart';
import 'package:mobile/features/writing/writing_page.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/pump_screen.dart';
import '../../helpers/scripted_dio.dart';

const _activityId = '11111111-1111-4111-8111-111111111111';

Map<String, dynamic> _viewJson({
  String status = 'draft',
  String text = '',
  int revision = 1,
  String? savedAt,
  bool readOnly = false,
  bool geminiKeyUsable = true,
  int used = 0,
  int max = 10,
  String? resetsAt,
  Map<String, dynamic>? failure,
  Map<String, dynamic>? correction,
}) => {
  'activityId': _activityId,
  'taskId': '22222222-2222-4222-8222-222222222222',
  'planId': '33333333-3333-4333-8333-333333333333',
  'activityState': 'in_progress',
  'readOnly': readOnly,
  'title': 'Writing: Third conditional',
  'task': {
    'heading': 'Letter to the editor',
    'statement': 'Write a letter to the editor about the riverside park.',
    'targetTags': [
      {'tag': 'grammar:conditional-3', 'label': 'Third conditional'},
    ],
  },
  'status': status,
  'draft': {'text': text, 'revision': revision, 'savedAt': savedAt},
  'submittedAt': null,
  'failure': failure,
  'correction': correction,
  'submission': {
    'geminiKeyUsable': geminiKeyUsable,
    'dailyLimit': {'max': max, 'used': used, 'resetsAt': resetsAt},
  },
  'serverTime': '2026-10-02T08:42:03.000Z',
};

Future<ScriptedAdapter> _pump(
  WidgetTester tester, {
  required Map<String, Responder> routes,
  bool tall = false,
  VoidCallback? onBackToToday,
  VoidCallback? onGoToSettings,
  VoidCallback? onSeeFullPlan,
  VoidCallback? onBackToPlan,
  bool settle = true,
}) async {
  SharedPreferences.setMockInitialValues({});
  final (dio, adapter) = scriptedDio(routes);
  final page = WritingPage(
    key: UniqueKey(),
    activityId: _activityId,
    api: WritingApi(dio),
    draftStore: WritingDraftStore(),
    profile: ProfileController(dio),
    onBackToToday: onBackToToday,
    onGoToSettings: onGoToSettings,
    onSeeFullPlan: onSeeFullPlan,
    onBackToPlan: onBackToPlan,
  );
  // `settle: false` is for a screen with a perpetual animation (the checking
  // view's spinner), which would make `pumpAndSettle` time out.
  if (tall) {
    tester.view
      ..physicalSize = const Size(360, 3000)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(theme: EqTheme.light(), home: page));
    if (settle) {
      await tester.pumpAndSettle();
    } else {
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
    }
  } else {
    await pumpOnSmallPhone(tester, page);
    if (settle) {
      await tester.pumpAndSettle();
    } else {
      await tester.pump(const Duration(milliseconds: 500));
    }
  }
  return adapter;
}

void main() {
  group('WritingPage', () {
    testWidgets('counter_and_submit_follow_the_threshold', (tester) async {
      await _pump(tester, routes: {'POST /activities/$_activityId/writing/open': ok(_viewJson())}, tall: true);

      final words79 = List.filled(79, 'word').join(' ');
      await tester.enterText(find.byType(TextField), words79);
      await tester.pumpAndSettle();

      expect(find.text('79 of 80 words'), findsOneWidget);
      expect(tester.widget<EqButton>(find.widgetWithText(EqButton, 'Submit for correction')).onPressed, isNull);

      await tester.enterText(find.byType(TextField), '$words79 more');
      await tester.pumpAndSettle();

      expect(find.text('80 words'), findsOneWidget);
      expect(tester.widget<EqButton>(find.widgetWithText(EqButton, 'Submit for correction')).onPressed, isNotNull);
    });

    testWidgets('the_counter_stays_above_the_keyboard', (tester) async {
      // A draft already has text, so the task card starts collapsed — the realistic shape of an
      // active typing session, where a user actually has the keyboard open.
      await _pump(tester, routes: {'POST /activities/$_activityId/writing/open': ok(_viewJson(text: 'Already writing something.'))});

      tester.view.viewInsets = FakeViewPadding(bottom: 300 * tester.view.devicePixelRatio);
      addTearDown(() => tester.view.resetViewInsets());
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.byType(TextField), findsOneWidget);
    });

    testWidgets('missing_key_notice_opens_settings', (tester) async {
      var navigated = false;
      await _pump(
        tester,
        routes: {'POST /activities/$_activityId/writing/open': ok(_viewJson(geminiKeyUsable: false))},
        onGoToSettings: () => navigated = true,
      );

      expect(find.text('Add your Gemini key to have your writing corrected.'), findsOneWidget);
      await tester.tap(find.text('Go to settings'));
      expect(navigated, isTrue);
    });

    testWidgets('limit_notice_shows_the_reset_time', (tester) async {
      await _pump(
        tester,
        routes: {'POST /activities/$_activityId/writing/open': ok(_viewJson(used: 10, resetsAt: '2026-10-03T06:12:40.000Z'))},
      );

      expect(find.textContaining("You have reached today's limit of 10 corrections."), findsOneWidget);
      expect(find.textContaining('Resets'), findsOneWidget);
    });

    testWidgets('confirmation_sheet_copy', (tester) async {
      final words90 = List.filled(90, 'word').join(' ');
      await _pump(
        tester,
        routes: {
          'POST /activities/$_activityId/writing/open': ok(_viewJson(text: words90, revision: 1)),
          'PUT /activities/$_activityId/writing/draft': ok({'revision': 1, 'savedAt': '2026-10-02T08:43:00.000Z', 'status': 'draft'}),
        },
        tall: true,
      );

      await tester.tap(find.widgetWithText(EqButton, 'Submit for correction'));
      await tester.pumpAndSettle();

      expect(find.text('Submit for correction?'), findsOneWidget);
      expect(find.textContaining('Your text will be corrected with your Gemini key.'), findsOneWidget);
      expect(find.text('Cancel'), findsOneWidget);
      expect(find.text('Submit'), findsOneWidget);
    });

    testWidgets('checking_view', (tester) async {
      final words90 = List.filled(90, 'word').join(' ');
      await _pump(tester, routes: {'POST /activities/$_activityId/writing/open': ok(_viewJson(status: 'correcting', text: words90))}, tall: true, settle: false);

      expect(find.text('Checking your writing…'), findsOneWidget);
      expect(find.text(words90), findsOneWidget);
    });

    testWidgets('failure_banners_with_retry', (tester) async {
      await _pump(
        tester,
        routes: {
          'POST /activities/$_activityId/writing/open': ok(
            _viewJson(
              status: 'uncorrected',
              text: 'My saved text.',
              failure: {'code': 'request_failed', 'message': 'Correction failed. Your text is saved — retry when ready.'},
            ),
          ),
        },
        tall: true,
      );

      expect(find.text('Correction failed. Your text is saved — retry when ready.'), findsOneWidget);
      expect(find.text('Retry correction'), findsOneWidget);
    });

    testWidgets('conflict_banner_and_local_version', (tester) async {
      final adapter = await _pump(
        tester,
        routes: {
          'POST /activities/$_activityId/writing/open': ok(_viewJson(text: 'Starting text', revision: 3)),
          'PUT /activities/$_activityId/writing/draft': (options) async {
            throw DioException(
              requestOptions: options,
              type: DioExceptionType.badResponse,
              response: Response(
                requestOptions: options,
                statusCode: 409,
                data: {
                  'error': {
                    'code': 'WRIT004',
                    'message': 'This draft was updated on another device.',
                    'details': {
                      'draft': {'text': 'Server copy wins', 'revision': 9, 'savedAt': null},
                    },
                  },
                },
              ),
            );
          },
        },
        tall: true,
      );
      addTearDown(() => adapter.requests.clear());

      await tester.enterText(find.byType(TextField), 'Starting text, edited.');
      await tester.pump(writingServerSaveInterval);
      await tester.pumpAndSettle();

      expect(find.text('This draft was updated on another device.'), findsOneWidget);
      await tester.tap(find.text('View your version'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Starting text, edited.'), findsWidgets);
    });

    testWidgets('read_only', (tester) async {
      await _pump(tester, routes: {'POST /activities/$_activityId/writing/open': ok(_viewJson(readOnly: true, text: 'Frozen text from before.'))}, tall: true);

      expect(find.text('Frozen text from before.'), findsOneWidget);
      expect(find.byType(TextField), findsNothing);
      expect(find.text('Submit for correction'), findsNothing);
      expect(find.text('Back to plan'), findsOneWidget);
    });

    testWidgets('no_connection_on_first_load', (tester) async {
      await _pump(tester, routes: {'POST /activities/$_activityId/writing/open': offline()});

      expect(find.text('No connection'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });
  });
}
