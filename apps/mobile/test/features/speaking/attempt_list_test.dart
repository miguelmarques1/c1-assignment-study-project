import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/design/eq_theme.dart';
import 'package:mobile/features/speaking/speaking_models.dart';
import 'package:mobile/features/speaking/widgets/attempt_list.dart';

SpeakingAttemptView _failedAttempt({bool rescorable = true, SpeakingAttemptState state = SpeakingAttemptState.failed}) =>
    SpeakingAttemptView(
      id: 'attempt-1',
      clientAttemptId: 'client-1',
      ordinal: null,
      state: state,
      createdAt: DateTime(2026, 10, 2),
      scoredAt: null,
      durationMs: 5000,
      isBest: false,
      failure: state == SpeakingAttemptState.failed
          ? SpeakingFailure(code: SpeakingFailureCode.serviceError, message: 'Scoring failed. Your recording is saved — re-score when ready.', rescorable: rescorable)
          : null,
      result: null,
    );

void main() {
  testWidgets('offers_rescore_for_a_rescorable_failure_with_attempts_remaining', (tester) async {
    String? rescoredId;

    await tester.pumpWidget(
      MaterialApp(
        theme: EqTheme.light(),
        home: Scaffold(
          body: AttemptList(
            attempts: [_failedAttempt()],
            attemptsRemaining: 2,
            playingAttemptId: null,
            onTogglePlay: (_) {},
            onRescore: (id) => rescoredId = id,
            rescoringId: null,
          ),
        ),
      ),
    );

    expect(find.textContaining('Not scored — Scoring failed'), findsOneWidget);
    await tester.tap(find.text('Re-score'));
    expect(rescoredId, 'attempt-1');
  });

  testWidgets('hides_rescore_once_every_attempt_has_been_used', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: EqTheme.light(),
        home: Scaffold(
          body: AttemptList(
            attempts: [_failedAttempt()],
            attemptsRemaining: 0,
            playingAttemptId: null,
            onTogglePlay: (_) {},
            onRescore: (_) {},
            rescoringId: null,
          ),
        ),
      ),
    );

    expect(find.text('Re-score'), findsNothing);
  });

  testWidgets('hides_rescore_for_a_non_rescorable_failure', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: EqTheme.light(),
        home: Scaffold(
          body: AttemptList(
            attempts: [_failedAttempt(rescorable: false)],
            attemptsRemaining: 2,
            playingAttemptId: null,
            onTogglePlay: (_) {},
            onRescore: (_) {},
            rescoringId: null,
          ),
        ),
      ),
    );

    expect(find.text('Re-score'), findsNothing);
  });

  testWidgets('renders_nothing_for_an_empty_list', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: EqTheme.light(),
        home: Scaffold(
          body: AttemptList(attempts: const [], attemptsRemaining: 3, playingAttemptId: null, onTogglePlay: (_) {}, onRescore: (_) {}, rescoringId: null),
        ),
      ),
    );

    expect(find.bySemanticsLabel('Previous attempts'), findsNothing);
  });
}
