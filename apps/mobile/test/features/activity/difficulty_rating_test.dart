import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/design/eq_theme.dart';
import 'package:mobile/features/activity/difficulty_rating.dart';
import 'package:mobile/features/plan/plan_models.dart' show DifficultyRating;

void main() {
  testWidgets('rates_and_keeps_the_existing_not_useful_flag', (tester) async {
    DifficultyRatingValue? submitted;

    await tester.pumpWidget(
      MaterialApp(
        theme: EqTheme.light(),
        home: Scaffold(
          body: DifficultyRatingWidget(
            value: const DifficultyRatingValue(rating: null, notUseful: true),
            onRate: (input) async => submitted = input,
          ),
        ),
      ),
    );

    await tester.tap(find.text('Just right'));
    await tester.pump();

    expect(submitted?.rating, DifficultyRating.justRight);
    expect(submitted?.notUseful, isTrue);
  });

  testWidgets('dismissing_hides_the_widget', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: EqTheme.light(),
        home: Scaffold(body: DifficultyRatingWidget(value: null, onRate: (_) async {})),
      ),
    );

    await tester.tap(find.byTooltip('Dismiss rating'));
    await tester.pump();

    expect(find.text('How was this activity?'), findsNothing);
  });
}
