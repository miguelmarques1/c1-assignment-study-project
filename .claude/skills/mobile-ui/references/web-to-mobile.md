# Translating a web mockup to mobile

Use this when a screen has a web mockup in `design/<screen>/` but no mobile one. Keep what the screen says and how it feels. Change only how it is arranged.

Before you start:

- Read the mockup's section in `design/README.md`. Dropped and deferred regions stay out on mobile too.
- Take the copy from the web implementation, not the mockup. The mockups contain Portuguese placeholders and gamification copy the product doesn't use.
- Check the feature's `spec.md` for which mobile destination (Today, Plan, Profile, Lessons, Settings) hosts the screen.

## Region by region

| Web pattern | Mobile translation |
|---|---|
| 12-column grid with 2–3 cards per row | A single column. Order the cards by what the user acts on first, then context. Cards are full width and separated by `gutterMobile` (12). |
| Canvas capped at 1200 px with 32 px margins | Full width with `marginMobile` (16) edges. Cap at 560 and centre on tablets. |
| Header with pill navigation | The shell's bottom `NavigationBar`, styled by `EqTheme` with a hard-outlined indicator and no Material tint. The page title becomes a `headlineLgMobile` heading at the top of the scroll content. |
| Header avatar or actions | Top-right of the page heading row, as icon buttons with tooltips and 48 dp targets. |
| Hero or display headline | `displayMobile` or `headlineLgMobile`. Keep the 2px outline and hard shadow; card padding goes to `lg` (24). |
| Side panel or aside (brief, details, filters) | A section below the main content, or a bottom sheet when the web panel opens on a toggle. |
| Modal dialog | `showModalBottomSheet`: a top border of 2px `outlineStrong`, `xl` top corners and `EqElevation.modal`. A destructive confirmation stays a dialog, styled by `dialogTheme`. |
| Table | A list of cards: the key field as the title, the others as label/value lines, and the status as an `EqBadge`. |
| Primary and secondary buttons side by side | Stacked. The primary is a full-width `EqButton` and the secondary a quieter button below it. Both sit at the end of the content, or pinned above the navigation bar or keyboard for forms. |
| Multi-column form | One field per row, full width, with `md` (16) between fields. |
| Hover state, tooltip or menu revealed on hover | Always visible, or a pressed state. Nothing depends on hover. |
| Sticky control bar | A pinned bottom area inside `SafeArea`, above the navigation bar. |
| Meter, chart or progress | Full width with the same colour roles, and the label above or below instead of beside it. |
| Chips in a row | A `Wrap` with `sm` (8) spacing, never a horizontal scroll that hides options. |
| Empty, error or loading panel | `EqEmpty`, `EqError` or `EqLoading`, with the web's copy. |

## When the result still looks off

- **Roboto instead of Plus Jakarta Sans:** the font asset isn't bundled in `pubspec.yaml`.
- **Purple or grey tints, rounded soft shadows:** a Material widget isn't covered by `EqTheme`. Add its component theme there instead of patching the page.
- **Words wrapping one per line:** a fixed or intrinsic width is squeezing the content. Let it stretch.
- **Everything looks the same weight:** headings aren't using the 700–800 steps, or cards are missing their outline and shadow.
- **The screen feels cramped:** section spacing isn't `xl` (40), or card padding dropped below `lg` (24).

## Layout test snippet

Put this in a shared test helper (`test/helpers/pump_screen.dart`) the first time a screen needs it. Reuse the page's existing test setup (Modular binds, a mocked `SessionStore`, a scripted `Dio` adapter) as `test/features/login_page_test.dart` does.

```dart
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
```

```dart
testWidgets('settings_fits_a_small_phone', (tester) async {
  await pumpOnSmallPhone(tester, const SettingsPage());
  expect(find.text('Settings'), findsOneWidget);
});

testWidgets('settings_survives_large_text', (tester) async {
  await pumpOnSmallPhone(tester, const SettingsPage(), textScale: 1.3);
  expect(tester.takeException(), isNull);
});
```
