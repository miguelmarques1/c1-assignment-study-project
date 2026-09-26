import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/design/eq_theme.dart';
import 'package:mobile/design/widgets/eq_page_state.dart';
import 'package:mobile/features/lessons/lessons_api.dart';
import 'package:mobile/features/lessons/lessons_page.dart';

import '../../helpers/pump_screen.dart';
import '../../helpers/scripted_dio.dart';
import 'fixtures.dart';

Future<ScriptedAdapter> _pump(
  WidgetTester tester,
  Map<String, Responder> responders, {
  double textScale = 1,
  void Function(String lessonId)? onOpen,
  bool tall = false,
}) async {
  final (dio, adapter) = scriptedDio(responders);
  // A fresh key per pump, so a test that pumps twice gets a fresh page and controller.
  final page = LessonsPage(key: UniqueKey(), api: LessonsApi(dio), onOpenLesson: onOpen ?? (_) {});
  if (tall) {
    tester.view
      ..physicalSize = const Size(360, 5000)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(theme: EqTheme.light(), home: page));
    await tester.pumpAndSettle();
  } else {
    await pumpOnSmallPhone(tester, page, textScale: textScale);
  }
  return adapter;
}

void main() {
  group('LessonsPage', () {
    testWidgets('lesson_rows_show_date_duration_participants_domain_and_status', (tester) async {
      String? opened;
      await _pump(tester, {'GET /lessons': ok(listJson([summaryJson()]))}, onOpen: (id) => opened = id);

      expect(find.textContaining('· 53 min'), findsOneWidget);
      expect(find.text('You, Ana'), findsOneWidget);
      expect(find.text('travel', findRichText: true), findsOneWidget);
      expect(find.text('READY'), findsOneWidget);
      expect(find.text('The missed connection'), findsOneWidget);
      expect(find.text('Grammar +4 · Pronunciation −2'), findsOneWidget);
      expect(find.text('Recordings use 12.4 MB of storage.'), findsOneWidget);

      await tester.tap(find.text('The missed connection'));
      expect(opened, lessonId);
    });

    testWidgets('every_status_and_flag_renders_a_distinct_label', (tester) async {
      await _pump(tester, {
        'GET /lessons': ok(
          listJson([
            summaryJson(id: 'l1', status: 'processing', activeStage: 'transcription', flags: ['partial']),
            summaryJson(id: 'l2', status: 'ready'),
            summaryJson(id: 'l3', status: 'blocked', statusReason: 'Blocked — add your Azure Speech key to continue.', flags: ['no_scenario']),
            summaryJson(id: 'l4', status: 'failed', statusReason: 'Failed.', flags: ['ended_unexpectedly']),
            summaryJson(id: 'l5', status: 'too_short', statusReason: 'Too short to analyze (minimum 3 minutes)'),
            summaryJson(id: 'l6', status: 'recording_failed', statusReason: 'Not recorded.'),
          ]),
        ),
      }, tall: true);

      const badges = ['PROCESSING', 'READY', 'BLOCKED', 'FAILED', 'TOO SHORT', 'RECORDING FAILED'];
      const chips = ['Partial', 'No scenario', 'Ended unexpectedly'];
      for (final badge in badges) {
        expect(find.text(badge), findsOneWidget, reason: badge);
      }
      for (final chip in chips) {
        expect(find.text(chip, findRichText: true), findsOneWidget, reason: chip);
      }
      expect({...badges, ...chips}, hasLength(9));
      // What each row says under its status.
      expect(find.text('Transcribing'), findsOneWidget);
      expect(find.text('Blocked — add your Azure Speech key to continue.'), findsOneWidget);
    });

    testWidgets('list_shows_loading_empty_and_error_states', (tester) async {
      final never = Completer<ResponseBody>();
      await _pump(tester, {'GET /lessons': (_) => never.future});
      expect(find.byType(EqLoading), findsOneWidget);

      final adapter = await _pump(tester, {'GET /lessons': ok(listJson([]))});
      expect(find.byType(EqEmpty), findsOneWidget);
      expect(find.textContaining('No lessons yet.'), findsOneWidget);
      await tester.tap(find.text('Refresh'));
      await tester.pumpAndSettle();
      expect(adapter.requests, hasLength(2));

      await _pump(tester, {'GET /lessons': offline()});
      expect(find.byType(EqError), findsOneWidget);
      expect(find.text('No connection'), findsOneWidget);

      await _pump(tester, {'GET /lessons': failure(500, 'SYS001', 'Boom')});
      expect(find.text('We could not load your lessons.'), findsOneWidget);
    });

    testWidgets('scrolling_to_the_end_loads_the_next_page', (tester) async {
      final adapter = await _pump(tester, {
        'GET /lessons': (options) async => options.queryParameters['cursor'] == 'c1'
            ? jsonBody({
                'data': listJson([summaryJson(id: 'older', title: 'An older lesson')]),
              })
            : jsonBody({
                'data': listJson([
                  for (var i = 0; i < 6; i++) summaryJson(id: 'l$i', title: 'Lesson $i'),
                ], nextCursor: 'c1'),
              }),
      });

      await tester.drag(find.byType(ListView), const Offset(0, -4000));
      await tester.pumpAndSettle();
      expect(adapter.requests.where((request) => request.queryParameters['cursor'] == 'c1'), hasLength(1));
      await tester.drag(find.byType(ListView), const Offset(0, -4000));
      await tester.pumpAndSettle();
      expect(find.text('An older lesson'), findsOneWidget);
    });

    testWidgets('polls_every_ten_seconds_only_while_something_is_pending', (tester) async {
      final pending = await _pump(tester, {'GET /lessons': ok(listJson([summaryJson(status: 'processing', activeStage: 'lesson_analysis')]))});
      await tester.pump(lessonPollInterval);
      await tester.pumpAndSettle();
      expect(pending.requests, hasLength(2));

      final settled = await _pump(tester, {'GET /lessons': ok(listJson([summaryJson()]))});
      await tester.pump(lessonPollInterval * 3);
      await tester.pumpAndSettle();
      expect(settled.requests, hasLength(1));
    });

    testWidgets('list_fits_a_small_phone_and_large_text', (tester) async {
      final rows = [
        summaryJson(id: 'a', status: 'blocked', statusReason: 'Blocked — add your Gemini key to analyze this lesson.', flags: ['partial', 'no_scenario', 'ended_unexpectedly']),
        summaryJson(id: 'b'),
      ];
      await _pump(tester, {'GET /lessons': ok(listJson(rows))});
      expect(tester.takeException(), isNull);
      await _pump(tester, {'GET /lessons': ok(listJson(rows))}, textScale: 1.3);
      expect(tester.takeException(), isNull);
      expect(find.text('Lessons'), findsOneWidget);
    });
  });
}
