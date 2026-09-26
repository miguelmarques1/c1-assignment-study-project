import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/design/eq_theme.dart';
import 'package:mobile/design/widgets/eq_meter.dart';

Widget _wrap(Widget child) => MaterialApp(theme: EqTheme.light(), home: Scaffold(body: child));

void main() {
  group('EqMeter', () {
    testWidgets('shows_value_and_signed_delta', (tester) async {
      await tester.pumpWidget(
        _wrap(
          const Column(
            children: [
              EqMeter(label: 'Grammar', value: 68, delta: 3),
              EqMeter(label: 'Vocabulary', value: 74, delta: -1),
              EqMeter(label: 'Fluency', value: 71, delta: 0),
            ],
          ),
        ),
      );

      expect(find.text('68 ▲ +3', findRichText: true), findsOneWidget);
      expect(find.text('74 ▼ -1', findRichText: true), findsOneWidget);
      // A zero change renders nothing, as on the web.
      expect(find.text('71', findRichText: true), findsOneWidget);
      expect(find.bySemanticsLabel('Grammar: 68 out of 100, up 3'), findsOneWidget);
      expect(find.bySemanticsLabel('Vocabulary: 74 out of 100, down 1'), findsOneWidget);
    });

    testWidgets('a_null_delta_can_read_as_a_dash', (tester) async {
      await tester.pumpWidget(_wrap(const EqMeter(label: 'Grammar', value: 70, showNullDelta: true)));

      expect(find.text('70 —', findRichText: true), findsOneWidget);
    });

    testWidgets('warming_up_hides_the_value_and_announces_it', (tester) async {
      await tester.pumpWidget(
        _wrap(const EqMeter(label: 'Interaction', value: null, state: EqMeterState.warmingUp, delta: 2)),
      );

      expect(find.text('Warming up'), findsOneWidget);
      expect(find.textContaining('▲'), findsNothing);
      expect(find.byKey(const Key('eq-meter-warming-track')), findsOneWidget);
      expect(find.bySemanticsLabel('Interaction: warming up, not enough data yet'), findsOneWidget);
    });
  });
}
