import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/profile/profile_models.dart';
import 'package:mobile/features/progress/progress_chart_model.dart';
import 'package:mobile/features/progress/progress_controller.dart';
import 'package:mobile/features/progress/progress_models.dart';
import 'package:mobile/features/progress/progress_page.dart';

import '../../helpers/pump_screen.dart';
import '../profile_fixtures.dart' as profile_fixtures;

Map<String, dynamic> _fixture() {
  final raw = jsonDecode(File('test/features/progress/progress-view.json').readAsStringSync()) as Map<String, dynamic>;
  return raw['data'] as Map<String, dynamic>;
}

(ProgressController, profile_fixtures.ScriptedAdapter) _controller(Map<String, profile_fixtures.Responder> responders) {
  final adapter = profile_fixtures.ScriptedAdapter(responders);
  return (ProgressController(Dio()..httpClientAdapter = adapter), adapter);
}

profile_fixtures.Responder _progress([Map<String, dynamic> Function(Map<String, dynamic> view)? change]) =>
    (_) async => profile_fixtures.jsonBody({'data': change == null ? _fixture() : change(_fixture())});

Future<void> _scrollTo(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(finder, 200, scrollable: find.byType(Scrollable).first);
  await tester.pumpAndSettle();
}

void main() {
  group('ProgressPage', () {
    testWidgets('renders_the_chart_legend_and_weaknesses_on_a_small_phone', (tester) async {
      final semantics = tester.ensureSemantics();
      final (controller, _) = _controller({'GET /progress': _progress()});
      await pumpOnSmallPhone(tester, ProgressPage(controller: controller));

      expect(find.text('How your competencies have changed, and what keeps coming back.'), findsOneWidget);
      expect(find.text('Competencies over time'), findsOneWidget);
      expect(find.byKey(const Key('competency-plot')), findsOneWidget);
      expect(find.text('Lesson'), findsOneWidget);
      expect(find.text('Activity'), findsOneWidget);
      for (final label in [
        'Grammar: 68, improving',
        'Vocabulary: 74, improving',
        'Fluency: 71, steady',
        'Interaction: warming up',
        'Comprehension: 80, declining',
        'Pronunciation: warming up',
      ]) {
        await _scrollTo(tester, find.bySemanticsLabel(label));
        expect(find.bySemanticsLabel(label), findsOneWidget);
      }

      await _scrollTo(tester, find.text('Third conditional'));
      expect(find.text('Recurring weaknesses'), findsOneWidget);
      expect(find.text('6 times · last seen 4 days ago'), findsOneWidget);
      expect(find.textContaining('Recent improvements'), findsNothing);
      expect(tester.takeException(), isNull);
      semantics.dispose();
    });

    testWidgets('survives_text_scaled_to_1_3', (tester) async {
      final (controller, _) = _controller({
        'GET /progress': _progress((view) {
          (view['profile'] as Map<String, dynamic>)['notes'] = [
            'Only Pronunciation was updated from your latest lesson. Add your Gemini key to update the other five competencies.',
          ];
          return view;
        }),
      });
      await pumpOnSmallPhone(tester, ProgressPage(controller: controller), textScale: 1.3);

      expect(find.text('Competencies over time'), findsOneWidget);
      await _scrollTo(tester, find.text('Show as list'));
      await tester.tap(find.text('Show as list'));
      await tester.pumpAndSettle();
      expect(find.text('Hide list'), findsOneWidget);
      await _scrollTo(tester, find.text('Third conditional'));
      expect(tester.takeException(), isNull);
    });

    testWidgets('legend_tiles_show_score_trend_or_warming_up', (tester) async {
      final (controller, _) = _controller({'GET /progress': _progress()});
      await pumpOnSmallPhone(tester, ProgressPage(controller: controller));
      await _scrollTo(tester, find.text('Show as list'));

      // Interaction and Pronunciation are warming up: the word, and no arrow.
      expect(find.text('Warming up'), findsNWidgets(2));
      expect(find.text('▲ Improving'), findsNWidgets(2));
      expect(find.text('▼ Declining'), findsOneWidget);
      // One tile (Fluency) and one weakness row (Phrasal verbs).
      expect(find.text('▶ Steady'), findsNWidgets(2));
      expect(find.text('68'), findsOneWidget);
    });

    testWidgets('first_tap_isolates_and_show_all_restores', (tester) async {
      final (controller, _) = _controller({'GET /progress': _progress()});
      await pumpOnSmallPhone(tester, ProgressPage(controller: controller));
      await _scrollTo(tester, find.text('Fluency'));
      expect(find.text('Show all'), findsNothing);

      await tester.tap(find.text('Fluency'));
      await tester.pumpAndSettle();

      expect(controller.visible.value, [ProfileCompetency.fluency]);
      await _scrollTo(tester, find.text('Show all'));
      await tester.tap(find.text('Show all'));
      await tester.pumpAndSettle();
      expect(controller.visible.value, showAll());
      expect(find.text('Show all'), findsNothing);
    });

    testWidgets('hiding_every_line_shows_the_hint', (tester) async {
      final (controller, _) = _controller({'GET /progress': _progress()});
      await pumpOnSmallPhone(tester, ProgressPage(controller: controller));
      await _scrollTo(tester, find.text('Fluency'));

      await tester.tap(find.text('Fluency'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Fluency'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Fluency'));
      await tester.pumpAndSettle();

      expect(controller.visible.value, isEmpty);
      await tester.scrollUntilVisible(
        find.text('Every line is hidden. Choose a competency below, or show all.'),
        -200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Every line is hidden. Choose a competency below, or show all.'), findsOneWidget);
    });

    testWidgets('range_selector_changes_the_plotted_points', (tester) async {
      final semantics = tester.ensureSemantics();
      final (controller, _) = _controller({'GET /progress': _progress()});
      await pumpOnSmallPhone(tester, ProgressPage(controller: controller));
      expect(
        find.bySemanticsLabel('Line chart of your competency scores, all time, 21 measurements.'),
        findsOneWidget,
      );

      await tester.tap(find.text('30 days'));
      await tester.pumpAndSettle();

      // The same count as the web on the shared fixture.
      expect(controller.range.value, ProgressRange.days30);
      expect(
        find.bySemanticsLabel('Line chart of your competency scores, last 30 days, 13 measurements.'),
        findsOneWidget,
      );
      semantics.dispose();
    });

    testWidgets('tapping_the_plot_shows_the_nearest_moment', (tester) async {
      final (controller, _) = _controller({'GET /progress': _progress()});
      await pumpOnSmallPhone(tester, ProgressPage(controller: controller));
      expect(find.text('Tap the chart to see a measurement.'), findsOneWidget);

      final view = controller.view.value!;
      final history = view.competencyHistory;
      final domain = chartDomain(history.series, null, view.serverTime)!;
      final plotFinder = find.byKey(const Key('competency-plot'));
      final size = tester.getSize(plotFinder);
      final x = xOf(DateTime.utc(2026, 9, 10, 12).millisecondsSinceEpoch, domain, plotRect(size.width, size.height));
      await tester.tapAt(tester.getTopLeft(plotFinder) + Offset(x, size.height / 2));
      await tester.pumpAndSettle();

      expect(find.textContaining('Lesson · 10 Sep. Grammar 66'), findsOneWidget);
      expect(find.text('Tap the chart to see a measurement.'), findsNothing);
    });

    testWidgets('fewer_than_three_measurements_shows_the_explanatory_empty_state', (tester) async {
      final (controller, _) = _controller({
        'GET /progress': _progress((view) {
          (view['competencyHistory'] as Map<String, dynamic>)['chartable'] = false;
          return view;
        }),
      });
      await pumpOnSmallPhone(tester, ProgressPage(controller: controller));

      expect(find.text('Not enough data yet — complete 3 lessons to see trends.'), findsOneWidget);
      expect(find.byKey(const Key('competency-plot')), findsNothing);
      // The legend still shows the snapshot.
      await _scrollTo(tester, find.text('Pronunciation'));
      expect(find.text('68'), findsOneWidget);
    });

    testWidgets('the_list_view_lists_every_moment', (tester) async {
      final (controller, _) = _controller({'GET /progress': _progress()});
      await pumpOnSmallPhone(tester, ProgressPage(controller: controller));
      await _scrollTo(tester, find.text('Show as list'));

      await tester.tap(find.text('Show as list'));
      await tester.pumpAndSettle();

      for (final label in ['Lesson · 14 Jul', 'Lesson · 20 Aug', 'Lesson · 10 Sep', 'Lesson · 24 Sep', 'Activity · 25 Sep']) {
        await _scrollTo(tester, find.text(label));
        expect(find.text(label), findsOneWidget);
      }
      expect(find.textContaining('Interaction —'), findsNWidgets(3));
    });

    testWidgets('a_lesson_row_in_the_list_opens_that_lesson', (tester) async {
      final opened = <String>[];
      final (controller, _) = _controller({'GET /progress': _progress()});
      await pumpOnSmallPhone(tester, ProgressPage(controller: controller, onOpenLesson: opened.add));
      await _scrollTo(tester, find.text('Show as list'));
      await tester.tap(find.text('Show as list'));
      await tester.pumpAndSettle();

      await _scrollTo(tester, find.text('Lesson · 14 Jul'));
      await tester.tap(find.text('Lesson · 14 Jul'));

      expect(opened, ['1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d']);
    });

    testWidgets('tapping_a_weakness_opens_its_sheet', (tester) async {
      final (controller, adapter) = _controller({
        'GET /progress': _progress(),
        'GET /profile/ledger/2b7f0c1e-5d4a-4c3b-9a8e-1f2d3c4b5a60': (_) async =>
            profile_fixtures.jsonBody({'data': profile_fixtures.detailJson()}),
      });
      await pumpOnSmallPhone(tester, ProgressPage(controller: controller));

      await _scrollTo(tester, find.text('Third conditional'));
      await tester.tap(find.text('Third conditional'));
      await tester.pumpAndSettle();

      expect(find.byType(BottomSheet), findsOneWidget);
      expect(find.text('“if I would have known”'), findsOneWidget);
      expect(adapter.calls['GET /profile/ledger/2b7f0c1e-5d4a-4c3b-9a8e-1f2d3c4b5a60'], 1);
    });

    testWidgets('shows_the_empty_state_without_an_action', (tester) async {
      final (controller, _) = _controller({
        'GET /progress': _progress((view) {
          (view['profile'] as Map<String, dynamic>)
            ..['empty'] = true
            ..['recurringWeaknesses'] = <Object>[];
          return view;
        }),
      });
      await pumpOnSmallPhone(tester, ProgressPage(controller: controller));

      expect(find.text('No progress yet. Your progress appears after your first analysed lesson.'), findsOneWidget);
      expect(find.byKey(const Key('competency-plot')), findsNothing);
      expect(find.byType(InkWell), findsNothing);
    });

    testWidgets('shows_the_error_state_with_retry', (tester) async {
      var attempts = 0;
      final (controller, adapter) = _controller({
        'GET /progress': (options) async {
          attempts += 1;
          if (attempts == 1) {
            throw DioException(requestOptions: options, type: DioExceptionType.connectionError);
          }
          return profile_fixtures.jsonBody({'data': _fixture()});
        },
      });
      await pumpOnSmallPhone(tester, ProgressPage(controller: controller));

      expect(find.text('Your progress could not be loaded.'), findsOneWidget);
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();

      expect(find.text('Competencies over time'), findsOneWidget);
      expect(adapter.calls['GET /progress'], 2);
    });

    testWidgets('renders_in_the_dark_theme', (tester) async {
      final (controller, _) = _controller({'GET /progress': _progress()});
      await pumpOnSmallPhone(tester, ProgressPage(controller: controller), dark: true);

      expect(find.byKey(const Key('competency-plot')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

}
