import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/design/eq_theme.dart';
import 'package:mobile/design/widgets/eq_meter.dart';

Future<void> _pump(WidgetTester tester, Widget child) => tester.pumpWidget(
  MaterialApp(theme: EqTheme.light(), home: Scaffold(body: Padding(padding: const EdgeInsets.all(16), child: child))),
);

String _text(WidgetTester tester) =>
    tester.widgetList<RichText>(find.byType(RichText)).map((text) => text.text.toPlainText()).join(' | ');

void main() {
  group('EqMeter', () {
    testWidgets('meter_renders_value_delta_and_dash', (tester) async {
      await _pump(tester, const EqMeter(label: 'Grammar', value: 72, delta: 4));
      expect(_text(tester), contains('72 ▲ +4'));

      await _pump(tester, const EqMeter(label: 'Vocabulary', value: 41, delta: -2));
      expect(_text(tester), contains('41 ▼ −2'));

      await _pump(tester, const EqMeter(label: 'Interaction', value: 66, noPreviousResult: true));
      expect(_text(tester), contains('66 —'));
      expect(find.bySemanticsLabel('Interaction: 66 out of 100, no previous result'), findsOneWidget);

      // No change and an omitted delta print only the value.
      await _pump(tester, const EqMeter(label: 'Fluency', value: 70, delta: 0));
      expect(_text(tester), isNot(contains('▲')));
      expect(_text(tester), isNot(contains('—')));
    });

    testWidgets('meter_in_warming_up_renders_copy_instead_of_a_number', (tester) async {
      await _pump(tester, const EqMeter(label: 'Fluency', value: null, state: EqMeterState.warmingUp));
      expect(find.text('Warming up'), findsOneWidget);
      expect(find.bySemanticsLabel('Fluency: warming up, not enough data yet'), findsOneWidget);
    });

    testWidgets('meter_announces_its_value_and_change', (tester) async {
      await _pump(tester, const EqMeter(label: 'Grammar', value: 72, delta: 4));
      expect(find.bySemanticsLabel('Grammar: 72 out of 100, up 4'), findsOneWidget);
    });
  });
}
