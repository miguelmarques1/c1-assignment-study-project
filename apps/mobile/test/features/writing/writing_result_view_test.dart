import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/design/eq_theme.dart';
import 'package:mobile/features/lessons/models/analysis_models.dart';
import 'package:mobile/features/writing/widgets/writing_result_view.dart';
import 'package:mobile/features/writing/writing_models.dart';

/// Pumps tall enough that every section of the scrollable result is built,
/// for content assertions — `lesson_detail_page_test.dart`'s `tall: true`.
Future<void> _pumpTall(WidgetTester tester, Widget screen) async {
  tester.view
    ..physicalSize = const Size(360, 3000)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MaterialApp(theme: EqTheme.light(), home: Scaffold(body: screen)));
  await tester.pumpAndSettle();
}

WritingCorrectionView _correction({List<WritingErrorGroupView>? errorGroups, List<WritingErrorView>? errors, List<WritingHighlightSegment>? text}) {
  final noErrors = errors != null && errors.isEmpty;
  return WritingCorrectionView(
    correctedAt: DateTime.parse('2026-10-02T09:00:00.000Z'),
    overallComment: 'A clear letter with good structure.',
    scores: const [
      WritingScoreView(dimension: WritingScoreDimension.grammar, label: 'Grammar', score: 70),
      WritingScoreView(dimension: WritingScoreDimension.vocabulary, label: 'Vocabulary', score: 80),
      WritingScoreView(dimension: WritingScoreDimension.coherence, label: 'Coherence', score: 90),
      WritingScoreView(dimension: WritingScoreDimension.taskAchievement, label: 'Task achievement', score: 60),
    ],
    text:
        text ??
        (noErrors
            ? const [WritingHighlightSegment(text: 'I went to the park.', errorIndexes: [])]
            : const [
                WritingHighlightSegment(text: 'I ', errorIndexes: []),
                WritingHighlightSegment(text: 'goed', errorIndexes: [0]),
                WritingHighlightSegment(text: ' to the park.', errorIndexes: []),
              ]),
    revision: const [
      WritingRevisionSegment(text: 'I ', changed: false),
      WritingRevisionSegment(text: 'went', changed: true),
      WritingRevisionSegment(text: ' to the park.', changed: false),
    ],
    errors:
        errors ??
        const [
          WritingErrorView(
            index: 0,
            quote: 'goed',
            tag: 'grammar:past-simple',
            tagLabel: 'Past simple',
            correction: 'went',
            correctionSegments: [CorrectionSegment(text: 'went', changed: true)],
            explanation: 'The past tense of "go" is irregular.',
          ),
        ],
    errorGroups:
        errorGroups ??
        const [
          WritingErrorGroupView(tag: 'grammar:past-simple', tagLabel: 'Past simple', errorIndexes: [0], recurrence: ErrorRecurrence(count: 3, label: '3rd time')),
        ],
  );
}

void main() {
  group('WritingResultView', () {
    testWidgets('tapping_a_highlight_opens_its_details', (tester) async {
      await _pumpTall(tester, WritingResultView(correction: _correction()));

      await tester.tap(find.text('goed'));
      await tester.pumpAndSettle();

      final sheet = find.byType(BottomSheet);
      expect(sheet, findsOneWidget);
      expect(find.descendant(of: sheet, matching: find.text('Past simple')), findsOneWidget);
      expect(find.descendant(of: sheet, matching: find.text('went')), findsOneWidget);
      expect(find.descendant(of: sheet, matching: find.text('The past tense of "go" is irregular.')), findsOneWidget);
    });

    testWidgets('toggle_to_revised', (tester) async {
      await _pumpTall(tester, WritingResultView(correction: _correction()));

      expect(find.text('goed'), findsOneWidget);

      await tester.tap(find.text('Revised version'));
      await tester.pumpAndSettle();

      expect(find.text('goed'), findsNothing);
      expect(find.textContaining('went', findRichText: true), findsWidgets);
    });

    testWidgets('four_meters', (tester) async {
      await _pumpTall(tester, WritingResultView(correction: _correction()));

      for (final label in ['Grammar', 'Vocabulary', 'Coherence', 'Task achievement']) {
        expect(find.text(label), findsOneWidget);
      }
    });

    testWidgets('groups_with_recurrence', (tester) async {
      await _pumpTall(tester, WritingResultView(correction: _correction()));

      expect(find.text('Past simple'), findsOneWidget);
      expect(find.text('3RD TIME'), findsOneWidget);
      expect(find.text('1 error'), findsOneWidget);
      expect(find.text('“goed”'), findsOneWidget);
    });

    testWidgets('empty_errors', (tester) async {
      await _pumpTall(tester, WritingResultView(correction: _correction(errorGroups: const [], errors: const [])));

      expect(find.text('No errors found in this text.'), findsOneWidget);
      expect(find.text('Past simple'), findsNothing);
    });
  });
}
