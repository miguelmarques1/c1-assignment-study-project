import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/design/eq_theme.dart';
import 'package:mobile/design/widgets/eq_chip.dart';

void main() {
  testWidgets('chip_renders_tone_and_count', (tester) async {
    for (final tone in EqChipTone.values) {
      await tester.pumpWidget(
        MaterialApp(theme: EqTheme.light(), home: Scaffold(body: Center(child: EqChip(label: 'Conditionals', tone: tone, count: 3)))),
      );
      expect(find.text('Conditionals ×3', findRichText: true), findsOneWidget);
    }

    await tester.pumpWidget(MaterialApp(theme: EqTheme.dark(), home: const Scaffold(body: Center(child: EqChip(label: 'travel')))));
    expect(find.text('travel', findRichText: true), findsOneWidget);
    expect(find.textContaining('×'), findsNothing);
  });
}
