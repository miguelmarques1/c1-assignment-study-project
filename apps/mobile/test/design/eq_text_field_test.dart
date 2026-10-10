import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/design/widgets/eq_text_field.dart';

import '../helpers/pump_screen.dart';

Widget _padded(Widget child) => Padding(padding: const EdgeInsets.all(16), child: child);

void main() {
  testWidgets('shows_a_label_and_reports_typed_text', (tester) async {
    String? typed;
    await pumpOnSmallPhone(tester, _padded(EqTextField(label: 'Your reason', onChanged: (value) => typed = value)));

    expect(find.text('Your reason'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'Travelling');
    expect(typed, 'Travelling');
  });

  testWidgets('shows_a_hint_or_an_error_but_not_both', (tester) async {
    await pumpOnSmallPhone(tester, _padded(const EqTextField(label: 'Reason', hint: 'Short is fine')));
    expect(find.text('Short is fine'), findsOneWidget);

    await pumpOnSmallPhone(tester, _padded(const EqTextField(label: 'Reason', hint: 'Short is fine', error: 'Required')));
    expect(find.text('Required'), findsOneWidget);
    expect(find.text('Short is fine'), findsNothing);
  });

  testWidgets('the_compact_variant_is_an_inline_box_with_an_accessible_name', (tester) async {
    await pumpOnSmallPhone(
      tester,
      Align(alignment: Alignment.topLeft, child: const EqTextField(compact: true, compactWidth: 140, semanticLabel: 'Answer for question 2')),
    );

    expect(tester.getSize(find.byType(EqTextField)).width, 140);
    expect(find.bySemanticsLabel('Answer for question 2'), findsOneWidget);
  });

  testWidgets('a_disabled_field_ignores_input', (tester) async {
    await pumpOnSmallPhone(tester, _padded(const EqTextField(label: 'Locked', enabled: false)));
    expect(tester.widget<TextField>(find.byType(TextField)).enabled, isFalse);
  });

  testWidgets('fits_a_small_phone_at_large_text', (tester) async {
    await pumpOnSmallPhone(tester, _padded(const EqTextField(label: 'Your reason', hint: 'Say why')), textScale: 1.3);
    expect(tester.takeException(), isNull);
  });
}
