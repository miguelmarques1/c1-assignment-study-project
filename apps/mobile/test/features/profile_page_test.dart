import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/design/eq_theme.dart';
import 'package:mobile/design/widgets/eq_meter.dart';
import 'package:mobile/features/profile/ledger_entry_sheet.dart';
import 'package:mobile/features/profile/profile_controller.dart';
import 'package:mobile/features/profile/profile_models.dart';
import 'package:mobile/features/profile/profile_page.dart';

import '../helpers/pump_screen.dart';
import 'profile_fixtures.dart';

(ProfileController, ScriptedAdapter) _controller(Map<String, Responder> responders) {
  final adapter = ScriptedAdapter(responders);
  final dio = Dio()..httpClientAdapter = adapter;
  return (ProfileController(dio), adapter);
}

Future<ResponseBody> _profile(RequestOptions _) async => jsonBody({'data': profileJson()});

Future<void> _scrollTo(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(finder, 200, scrollable: find.byType(Scrollable).first);
  await tester.pumpAndSettle();
}

void main() {
  group('ProfilePage', () {
    testWidgets('renders_competencies_and_weaknesses_on_a_small_phone', (tester) async {
      final (controller, _) = _controller({'GET /profile': _profile});
      await pumpOnSmallPhone(tester, ProfilePage(controller: controller));

      expect(find.text('Learning profile'), findsOneWidget);
      expect(find.text('Smoothed across your recent lessons and activities.'), findsOneWidget);
      expect(find.byType(EqMeter), findsNWidgets(6));
      expect(find.text('68 ▲ +3', findRichText: true), findsOneWidget);
      expect(find.text('Warming up'), findsOneWidget);

      final row = find.bySemanticsLabel('Third conditional: 6 times, last seen 3 days ago, New, Rising');
      await _scrollTo(tester, find.text('Third conditional'));
      expect(row, findsOneWidget);
      expect(find.text('6 times · last seen 3 days ago'), findsOneWidget);
      expect(find.text('▲ Rising'), findsOneWidget);
      expect(find.text('grammar:conditional-3'), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('survives_text_scaled_to_1_3', (tester) async {
      final (controller, _) = _controller({
        'GET /profile': (_) async => jsonBody({
          'data': profileJson(
            notes: [
              'Only Pronunciation was updated from your latest lesson. Add your Gemini key to update the other five competencies.',
            ],
          ),
        }),
      });
      await pumpOnSmallPhone(tester, ProfilePage(controller: controller), textScale: 1.3);

      expect(find.text('Learning profile'), findsOneWidget);
      await _scrollTo(tester, find.text('Show accuracy and prosody'));
      await tester.tap(find.text('Show accuracy and prosody'));
      await tester.pumpAndSettle();
      expect(find.text('Hide accuracy and prosody'), findsOneWidget);
      await _scrollTo(tester, find.text('Third conditional'));
      expect(tester.takeException(), isNull);
    });

    testWidgets('shows_the_empty_state_without_an_action', (tester) async {
      final (controller, _) = _controller({
        'GET /profile': (_) async => jsonBody({'data': profileJson(empty: true, weaknesses: [])}),
      });
      await pumpOnSmallPhone(tester, ProfilePage(controller: controller));

      expect(
        find.text('No profile yet. Your competencies appear after your first analysed lesson.'),
        findsOneWidget,
      );
      expect(find.byType(EqMeter), findsNothing);
      expect(find.byType(InkWell), findsNothing);
    });

    testWidgets('shows_the_error_state_with_retry', (tester) async {
      var attempts = 0;
      final (controller, adapter) = _controller({
        'GET /profile': (options) async {
          attempts += 1;
          if (attempts == 1) {
            throw DioException(requestOptions: options, type: DioExceptionType.connectionError);
          }
          return jsonBody({'data': profileJson()});
        },
      });
      await pumpOnSmallPhone(tester, ProfilePage(controller: controller));

      expect(find.text('Your profile could not be loaded.'), findsOneWidget);
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();

      expect(find.byType(EqMeter), findsNWidgets(6));
      expect(adapter.calls['GET /profile'], 2);
    });

    testWidgets('pronunciation_tile_expands', (tester) async {
      final (controller, _) = _controller({
        'GET /profile': (_) async => jsonBody({'data': profileJson(prosody: null)}),
      });
      await pumpOnSmallPhone(tester, ProfilePage(controller: controller));

      expect(find.text('Accuracy'), findsNothing);
      await _scrollTo(tester, find.text('Show accuracy and prosody'));
      await tester.tap(find.text('Show accuracy and prosody'));
      await tester.pumpAndSettle();

      expect(find.text('Hide accuracy and prosody'), findsOneWidget);
      expect(find.bySemanticsLabel('Accuracy: 81 out of 100'), findsOneWidget);
      expect(find.text('Prosody: not measured for this language'), findsOneWidget);
    });

    testWidgets('tapping_a_row_opens_the_detail_sheet', (tester) async {
      final (controller, adapter) = _controller({
        'GET /profile': _profile,
        'GET /profile/ledger/$entryId': (_) async => jsonBody({'data': detailJson()}),
      });
      await pumpOnSmallPhone(tester, ProfilePage(controller: controller));

      await _scrollTo(tester, find.text('Third conditional'));
      await tester.tap(find.text('Third conditional'));
      await tester.pumpAndSettle();

      expect(find.byType(BottomSheet), findsOneWidget);
      expect(find.text('“if I would have known”'), findsOneWidget);
      expect(find.text('Correction: if I had known'), findsOneWidget);
      expect(find.text('Words: “think”, “three” (4 failing instances)'), findsOneWidget);
      expect(find.text('Lesson · 3 days ago · 2 times'), findsOneWidget);
      expect(adapter.calls['GET /profile/ledger/$entryId'], 1);
      expect(tester.takeException(), isNull);
    });

    testWidgets('lesson_examples_link_to_the_lesson', (tester) async {
      final opened = <String>[];
      await tester.pumpWidget(
        MaterialApp(
          theme: EqTheme.light(),
          home: Scaffold(
            body: LedgerEntrySheet(
              entryId: entryId,
              label: 'Third conditional',
              load: (_) async => LedgerEntryDetailView.fromJson(detailJson()),
              onOpenLesson: opened.add,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // A27: every lesson source is a link to that lesson (F19's detail).
      expect(find.widgetWithText(TextButton, 'Lesson · 3 days ago'), findsNWidgets(2));
      await tester.ensureVisible(find.text('Lesson · 3 days ago · 2 times'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Lesson · 3 days ago · 2 times'));
      expect(opened, [lessonId]);
    });
  });
}
