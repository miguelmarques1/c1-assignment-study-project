import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/design/eq_theme.dart';
import 'package:mobile/features/lessons/lesson_detail_page.dart';
import 'package:mobile/features/lessons/lessons_api.dart';

import '../../helpers/pump_screen.dart';
import '../../helpers/scripted_dio.dart';
import 'fixtures.dart';

Map<String, Responder> _routes({Map<String, Responder> overrides = const {}}) => {
  'GET /lessons/$lessonId': ok(detailJson()),
  'GET /lessons/$lessonId/analysis': ok(analysisJson()),
  'GET /lessons/$lessonId/pronunciation': ok(pronunciationJson()),
  'GET /lessons/$lessonId/transcript': ok(transcriptJson()),
  'GET /lessons/$lessonId/scenario': ok(scenarioJson()),
  'GET /lessons/$lessonId/pipeline': ok(pipelineJson()),
  'GET /lessons/$lessonId/recording': ok(recordingJson()),
  'POST /lessons/$lessonId/pipeline/retry': ok(pipelineJson()),
  ...overrides,
};

Future<ScriptedAdapter> _pump(
  WidgetTester tester, {
  Map<String, Responder> overrides = const {},
  void Function(String path)? onNavigate,
  double textScale = 1,
  bool tall = true,
}) async {
  final (dio, adapter) = scriptedDio(_routes(overrides: overrides));
  final page = LessonDetailPage(key: UniqueKey(), lessonId: lessonId, api: LessonsApi(dio), onNavigate: onNavigate ?? (_) {});
  if (tall) {
    // Tall enough that every section of a tab is built, for content assertions.
    tester.view
      ..physicalSize = const Size(360, 8000)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(theme: EqTheme.light(), home: page));
    await tester.pumpAndSettle();
  } else {
    await pumpOnSmallPhone(tester, page, textScale: textScale);
  }
  return adapter;
}

/// The tab bar scrolls on a narrow phone, so a tab may first need bringing into view.
Future<void> _openTab(WidgetTester tester, String name) async {
  final tab = find.widgetWithText(Tab, name);
  await tester.ensureVisible(tab);
  await tester.pumpAndSettle();
  await tester.tap(tab);
  await tester.pumpAndSettle();
}

List<String> _badgeTexts(WidgetTester tester, Finder scope) => tester
    .widgetList<Text>(find.descendant(of: scope, matching: find.byType(Text)))
    .map((text) => text.data ?? '')
    .toList();

void main() {
  group('LessonDetailPage', () {
    testWidgets('detail_shows_the_four_tabs', (tester) async {
      await _pump(tester);
      for (final tab in ['Result', 'Scenario', 'Transcript', 'Status']) {
        expect(find.widgetWithText(Tab, tab), findsOneWidget);
      }
      expect(find.text('The missed connection'), findsWidgets);
    });

    testWidgets('result_tab_renders_scores_errors_fit_and_pronunciation', (tester) async {
      await _pump(tester);

      expect(find.bySemanticsLabel('Grammar: 72 out of 100, up 4'), findsOneWidget);
      expect(find.bySemanticsLabel('Vocabulary: 68 out of 100, down 2'), findsOneWidget);
      expect(find.bySemanticsLabel('Interaction: 75 out of 100, no previous result'), findsOneWidget);
      expect(find.bySemanticsLabel('Pronunciation: 78 out of 100, down 2'), findsNWidgets(2));
      expect(find.text('Major (1)'), findsOneWidget);
      expect(find.text('Minor (1)'), findsOneWidget);
      expect(find.text('“if I would have known, I would have booked earlier”'), findsWidgets);
      expect(find.textContaining('had', findRichText: true), findsWidgets);
      expect(find.text('The third conditional takes the past perfect after "if".'), findsOneWidget);
      expect(find.text('Third conditional', findRichText: true), findsWidgets);
      expect(find.text('4TH TIME'), findsOneWidget);
      expect(find.text('Used'), findsOneWidget);
      expect(find.text('Not used'), findsOneWidget);
      expect(find.text('REGISTER MATCHED'), findsOneWidget);
      expect(find.text('Not measured'), findsOneWidget);
      expect(find.text('Sounds to work on'), findsOneWidget);
      expect(find.text('Topics to practice'), findsOneWidget);
    });

    testWidgets('a_blocked_analysis_keeps_pronunciation_and_links_to_settings', (tester) async {
      final navigated = <String>[];
      await _pump(
        tester,
        onNavigate: navigated.add,
        overrides: {
          'GET /lessons/$lessonId': ok(detailJson(status: 'blocked', statusReason: 'Blocked — add your Gemini key to analyze this lesson.')),
          'GET /lessons/$lessonId/analysis': ok({'lessonId': lessonId, 'status': 'pending', 'analysis': null}),
        },
      );
      expect(find.text('Your result is waiting'), findsOneWidget);
      expect(find.text('Blocked — add your Gemini key to analyze this lesson.'), findsOneWidget);
      expect(find.text('Sounds to work on'), findsOneWidget);
      await tester.tap(find.text('Open settings'));
      expect(navigated, ['/app/settings']);
    });

    testWidgets('scenario_tab_shows_only_my_card', (tester) async {
      await _pump(tester);
      await _openTab(tester, 'Scenario');

      expect(find.text('Only you can see this', findRichText: true), findsOneWidget);
      expect(find.text('Get the last seat without revealing the interview is optional.'), findsOneWidget);
      expect(find.text('The Traveler'), findsOneWidget);
      expect(find.text('Airline agent'), findsOneWidget);
      expect(find.text('Who deserves priority?'), findsOneWidget);
      expect(find.bySemanticsLabel(RegExp('^Your role card')), findsOneWidget);
    });

    testWidgets('transcript_badge_expands_and_matches_the_section', (tester) async {
      await _pump(tester);
      final section = _badgeTexts(tester, find.byType(Scaffold)).where((text) => text == '71' || text == '85').toSet();
      expect(section, {'71', '85'});

      await _openTab(tester, 'Transcript');
      expect(find.text('00:05'), findsOneWidget);
      expect(find.text('04:07'), findsOneWidget);
      expect(find.text('You'), findsWidgets);
      expect(find.text('Ana · Transcript pending', findRichText: true), findsOneWidget);

      final badges = tester
          .widgetList<Text>(find.descendant(of: find.byKey(const Key('excerpt-badge')), matching: find.byType(Text)))
          .map((text) => text.data)
          .toSet();
      expect(badges, section);

      await tester.tap(find.bySemanticsLabel('Pronunciation score 71'));
      await tester.pumpAndSettle();
      expect(find.bySemanticsLabel('known: 54 out of 100, needs work, Mispronunciation'), findsOneWidget);
      expect(find.text('Selected: recognition confidence 0.62, 10 words'), findsOneWidget);
      expect(find.text('Prosody 67'), findsOneWidget);
    });

    testWidgets('status_tab_retries_and_links_to_settings', (tester) async {
      final navigated = <String>[];
      final adapter = await _pump(tester, onNavigate: navigated.add);
      await _openTab(tester, 'Status');

      expect(find.text('4 of 12 excerpts'), findsOneWidget);
      expect(find.text('Captured 42 min of audio'), findsOneWidget);
      expect(find.text('Details: Schema validation failed at /errors/3'), findsOneWidget);
      expect(find.textContaining('Last attempt'), findsOneWidget);
      expect(find.text('Blocked — add your Azure Speech key to continue.'), findsOneWidget);
      expect(find.bySemanticsLabel(RegExp("^Ana's processing")), findsOneWidget);
      expect(find.text('In progress'), findsOneWidget);

      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(adapter.requests.where((request) => request.method == 'POST' && request.path.endsWith('/pipeline/retry')), hasLength(1));

      await tester.tap(find.text('Open settings'));
      expect(navigated, ['/app/settings']);
    });

    testWidgets('a_lesson_that_is_not_mine_reads_as_unavailable', (tester) async {
      final navigated = <String>[];
      await _pump(
        tester,
        onNavigate: navigated.add,
        overrides: {'GET /lessons/$lessonId': failure(403, 'CLASS004', 'You are not a participant in this lesson.')},
      );
      expect(find.text("This lesson isn't available to you."), findsOneWidget);
      await tester.tap(find.text('Back to lessons'));
      expect(navigated, ['/app/lessons']);
    });

    testWidgets('no_tab_renders_an_audio_control', (tester) async {
      await _pump(tester);
      for (final tab in ['Result', 'Scenario', 'Transcript', 'Status']) {
        await _openTab(tester, tab);
        if (tab == 'Transcript') {
          await tester.tap(find.bySemanticsLabel('Pronunciation score 71'));
          await tester.pumpAndSettle();
        }
        for (final icon in [Icons.play_arrow, Icons.play_circle_outline, Icons.volume_up, Icons.headphones, Icons.mic]) {
          expect(find.byIcon(icon), findsNothing, reason: '$tab shows $icon');
        }
        expect(find.textContaining(RegExp(r'\b(play|listen|audio file|replay|download)\b', caseSensitive: false)), findsNothing);
      }
    });

    testWidgets('detail_fits_a_small_phone_and_large_text', (tester) async {
      for (final scale in [1.0, 1.3]) {
        await _pump(tester, tall: false, textScale: scale);
        for (final tab in ['Result', 'Scenario', 'Transcript', 'Status']) {
          await _openTab(tester, tab);
          expect(tester.takeException(), isNull, reason: '$tab at $scale');
        }
      }
    });
  });
}
