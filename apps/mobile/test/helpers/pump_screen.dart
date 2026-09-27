import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/design/eq_theme.dart';

/// Pumps [screen] on a small phone (360×690 dp) under the app theme. Pass a
/// [textScale] above 1 to prove the layout survives large accessibility text:
/// any RenderFlex overflow fails the test.
Future<void> pumpOnSmallPhone(WidgetTester tester, Widget screen, {double textScale = 1}) async {
  tester.view
    ..physicalSize = const Size(360, 690)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MaterialApp(
      theme: EqTheme.light(),
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(textScale)),
        child: child!,
      ),
      home: screen,
    ),
  );
  await tester.pumpAndSettle();
}
