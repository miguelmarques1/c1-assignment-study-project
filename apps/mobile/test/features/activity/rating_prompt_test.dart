import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/activity/widgets/rating_prompt.dart';

import '../../helpers/pump_screen.dart';

void main() {
  testWidgets('a_rating_is_sent_with_the_current_not_useful_flag', (tester) async {
    final calls = <(String?, bool)>[];
    await pumpOnSmallPhone(
      tester,
      RatingPrompt(
        initialRating: null,
        initialNotUseful: false,
        onRate: ({required rating, required notUseful}) async => calls.add((rating, notUseful)),
      ),
    );

    await tester.tap(find.text('Just right'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Not useful'));
    await tester.pumpAndSettle();

    expect(calls, [('just_right', false), ('just_right', true)]);
    expect(find.text('Not useful ✓'), findsOneWidget);
  });

  testWidgets('not_now_dismisses_without_sending_anything', (tester) async {
    var sent = false;
    await pumpOnSmallPhone(
      tester,
      RatingPrompt(initialRating: null, initialNotUseful: false, onRate: ({required rating, required notUseful}) async => sent = true),
    );

    await tester.tap(find.text('Not now'));
    await tester.pumpAndSettle();

    expect(find.text('How was this activity?'), findsNothing);
    expect(sent, isFalse);
  });

  testWidgets('a_failed_rating_offers_retry_and_restores_the_previous_state', (tester) async {
    var attempts = 0;
    await pumpOnSmallPhone(
      tester,
      RatingPrompt(
        initialRating: null,
        initialNotUseful: false,
        onRate: ({required rating, required notUseful}) async {
          attempts += 1;
          if (attempts == 1) throw Exception('offline');
        },
      ),
    );

    await tester.tap(find.text('Too hard'));
    await tester.pumpAndSettle();
    expect(find.text('Your rating could not be saved.'), findsOneWidget);

    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();

    expect(attempts, 2);
    expect(find.text('Your rating could not be saved.'), findsNothing);
  });

  testWidgets('fits_a_small_phone_at_large_text', (tester) async {
    await pumpOnSmallPhone(
      tester,
      RatingPrompt(initialRating: null, initialNotUseful: true, onRate: ({required rating, required notUseful}) async {}),
      textScale: 1.3,
    );
    expect(tester.takeException(), isNull);
  });
}
