import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/design/eq_theme.dart';
import 'package:mobile/design/widgets/eq_meter.dart';

Widget _wrap(Widget child) => MaterialApp(
  theme: EqTheme.light(),
  home: Scaffold(body: Padding(padding: const EdgeInsets.all(16), child: child)),
);

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
              EqMeter(label: 'Comprehension', value: 60),
            ],
          ),
        ),
      );

      expect(find.text('68 ▲ +3', findRichText: true), findsOneWidget);
      // U+2212, like the web's Meter.
      expect(find.text('74 ▼ −1', findRichText: true), findsOneWidget);
      // A zero change and an omitted delta render only the value, as on the web.
      expect(find.text('71', findRichText: true), findsOneWidget);
      expect(find.text('60', findRichText: true), findsOneWidget);
      expect(find.bySemanticsLabel('Grammar: 68 out of 100, up 3'), findsOneWidget);
      expect(find.bySemanticsLabel('Vocabulary: 74 out of 100, down 1'), findsOneWidget);
      expect(find.bySemanticsLabel('Fluency: 71 out of 100'), findsOneWidget);
    });

    testWidgets('no_previous_result_reads_as_a_dash', (tester) async {
      await tester.pumpWidget(_wrap(const EqMeter(label: 'Interaction', value: 66, noPreviousResult: true)));

      expect(find.text('66 —', findRichText: true), findsOneWidget);
      expect(find.bySemanticsLabel('Interaction: 66 out of 100, no previous result'), findsOneWidget);
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
