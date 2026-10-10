import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/design/eq_theme.dart';
import 'package:mobile/design/widgets/eq_segmented_control.dart';

const _options = [
  EqSegmentedOption(value: 'all', label: 'All time'),
  EqSegmentedOption(value: '90d', label: '90 days'),
  EqSegmentedOption(value: '30d', label: '30 days'),
];

Widget _host(String value, ValueChanged<String> onChanged, {bool dark = false}) => MaterialApp(
  theme: dark ? EqTheme.dark() : EqTheme.light(),
  home: Scaffold(
    body: Center(
      child: EqSegmentedControl<String>(options: _options, value: value, onChanged: onChanged, label: 'Time range'),
    ),
  ),
);

void main() {
  group('EqSegmentedControl', () {
    testWidgets('selects_on_tap_and_announces_the_selection', (tester) async {
      final semantics = tester.ensureSemantics();
      final changes = <String>[];
      await tester.pumpWidget(_host('all', changes.add));

      final selected = tester.getSemantics(find.bySemanticsLabel('All time'));
      expect(selected.flagsCollection.isSelected.toBoolOrNull(), isTrue);
      final other = tester.getSemantics(find.bySemanticsLabel('90 days'));
      expect(other.flagsCollection.isSelected.toBoolOrNull(), isFalse);
      expect(find.bySemanticsLabel('Time range'), findsOneWidget);

      await tester.tap(find.text('30 days'));
      expect(changes, ['30d']);
      semantics.dispose();
    });

    testWidgets('keeps_48dp_targets', (tester) async {
      await tester.pumpWidget(_host('all', (_) {}));

      for (final label in ['All time', '90 days', '30 days']) {
        final size = tester.getSize(find.ancestor(of: find.text(label), matching: find.byType(ConstrainedBox)).first);
        expect(size.height, greaterThanOrEqualTo(48));
      }
    });

    testWidgets('renders_in_the_dark_theme', (tester) async {
      await tester.pumpWidget(_host('90d', (_) {}, dark: true));

      expect(find.text('90 days'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}
