import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/design/widgets/eq_page_state.dart';

Widget _wrap(Widget child) => MaterialApp(home: Scaffold(body: child));

void main() {
  group('EqLoading / EqEmpty / EqError', () {
    testWidgets('loading_renders_a_skeleton_not_a_spinner', (tester) async {
      await tester.pumpWidget(_wrap(const EqLoading()));

      expect(find.byKey(const Key('eq-loading-skeleton')), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);
    });

    testWidgets('empty_states_the_missing_thing_and_one_action', (tester) async {
      await tester.pumpWidget(
        _wrap(EqEmpty(message: 'No lessons yet', actionLabel: 'Add one', onAction: () {})),
      );

      expect(find.text('No lessons yet'), findsOneWidget);
      expect(find.text('Add one'), findsOneWidget);
      expect(find.byWidgetPredicate((w) => w is InkWell), findsOneWidget);
    });

    testWidgets('error_names_the_cause_and_offers_a_retry', (tester) async {
      var retried = false;

      await tester.pumpWidget(_wrap(EqError(cause: 'No connection', onRetry: () => retried = true)));

      expect(find.text('No connection'), findsOneWidget);
      await tester.tap(find.text('Retry'));
      expect(retried, isTrue);
    });
  });
}
