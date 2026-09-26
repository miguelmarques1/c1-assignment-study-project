import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/design/eq_theme.dart';
import 'package:mobile/design/widgets/eq_chip.dart';

void main() {
  group('EqChip', () {
    testWidgets('renders_each_tone_with_its_label', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: EqTheme.light(),
          home: Scaffold(
            body: Wrap(
              children: [
                for (final tone in EqChipTone.values) EqChip(label: tone.name, tone: tone),
                const EqChip(label: 'Third conditional', tone: EqChipTone.warning, count: 3),
              ],
            ),
          ),
        ),
      );

      for (final tone in EqChipTone.values) {
        expect(find.text(tone.name, findRichText: true), findsOneWidget);
      }
      expect(find.text('Third conditional ×3', findRichText: true), findsOneWidget);

      final decorations = tester
          .widgetList<DecoratedBox>(find.descendant(of: find.byType(EqChip), matching: find.byType(DecoratedBox)))
          .map((box) => (box.decoration as BoxDecoration).color)
          .toSet();
      // Five tones, five distinct fills (the counted chip shares warning's).
      expect(decorations, hasLength(EqChipTone.values.length));
    });
  });
}
