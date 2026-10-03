import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/design/eq_theme.dart';
import 'package:mobile/features/lessons/models/transcript_models.dart';
import 'package:mobile/features/speaking/speaking_models.dart';
import 'package:mobile/features/speaking/widgets/spoken_words.dart';

const _words = [
  SpeakingWord(text: 'Nothing', band: null, accuracy: null, errorTypes: [], startMs: null, durationMs: null),
  SpeakingWord(text: 'thorough', band: null, accuracy: 40, errorTypes: ['Mispronunciation'], startMs: 500, durationMs: 300),
];

void main() {
  testWidgets('plays_a_poor_words_range_when_tapped', (tester) async {
    int? capturedStart;
    int? capturedDuration;

    await tester.pumpWidget(
      MaterialApp(
        theme: EqTheme.light(),
        home: Scaffold(
          body: SpokenWords(
            words: const [
              SpeakingWord(text: 'thorough', band: WordBand.poor, accuracy: 40, errorTypes: ['Mispronunciation'], startMs: 500, durationMs: 300),
            ],
            onPlayRange: (startMs, durationMs) {
              capturedStart = startMs;
              capturedDuration = durationMs;
            },
          ),
        ),
      ),
    );

    await tester.tap(find.text('thorough'));
    await tester.pump();

    expect(capturedStart, 500);
    expect(capturedDuration, 300);
  });

  testWidgets('renders_an_unassessed_token_without_a_play_control', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: EqTheme.light(),
        home: Scaffold(
          body: SpokenWords(
            words: const [
              SpeakingWord(text: 'extra', band: null, accuracy: null, errorTypes: [], startMs: null, durationMs: null),
            ],
            onPlayRange: (_, _) {},
          ),
        ),
      ),
    );

    expect(find.bySemanticsLabel('extra: not assessed'), findsOneWidget);
    expect(find.byType(GestureDetector), findsNothing);
  });

  testWidgets('shows_the_band_legend', (tester) async {
    await tester.pumpWidget(
      MaterialApp(theme: EqTheme.light(), home: Scaffold(body: SpokenWords(words: _words))),
    );

    expect(find.text('Good (80+)'), findsOneWidget);
    expect(find.text('Fair (60–79)'), findsOneWidget);
    expect(find.text('Needs work (below 60)'), findsOneWidget);
  });
}
