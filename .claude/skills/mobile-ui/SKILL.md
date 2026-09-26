---
name: mobile-ui
description: Design and build English Quest's Flutter screens and widgets so they look like the product (the warm neo-brutalist design system), not like stock Material. Use for ANY change to a mobile screen, widget, theme or layout in apps/mobile, including new screens, restyling, layout bugs and porting a web screen to mobile.
paths:
  - apps/mobile/lib/**
  - apps/mobile/test/**
---

# Mobile UI

The mobile app must read as the same product as the web: warm paper surfaces, crisp 2px black outlines, hard offset shadows, bold Plus Jakarta Sans headings, and buttons that physically press. When a screen looks like a default Flutter demo (Roboto, purple tints, soft blurred elevation, underlined text fields, ripples), that is a bug, not a style choice.

The source of truth for the language is `design/english_quest_design_system/DESIGN.md`. The values live in `packages/design-tokens/tokens.json`, and the Dart library generated from it is `package:english_quest_tokens`.

## 1. Find the design before writing code

Work down this list and stop at the first match:

1. **A mobile mockup exists** in `design/mobile_<screen>/` (`screen.png` and `code.html`, exported from Stitch). It rules, exactly as web mockups do for the web. Add or extend that mockup's section in `design/README.md` (a region table like the web ones).
2. **Only a web mockup exists** for the same screen in `design/<screen>/`. Translate it with [references/web-to-mobile.md](references/web-to-mobile.md). Keep the content, hierarchy, tone and component vocabulary; change the arrangement for a narrow, touch-first screen. In your final message, name the mockup you translated and list every translation decision (what stacked, what moved to a bottom sheet, what got shortened), so the user can review it on their device.
3. **No mockup at all.** Compose the screen from existing `Eq*` widgets and the patterns below, say plainly that it has no mockup, and suggest generating one in Stitch if the screen matters.

The two-sided fidelity rule applies to mobile too. A region that `design/README.md` marks `dropped` (XP, streaks, badges, social login, …) is not built on mobile either, and a region marked `deferred` waits for its owning feature.

## 2. The design language in Flutter terms

| Aspect | Rule | Where it comes from |
|---|---|---|
| Colour | Use roles only: `EqLightColors.*` / `EqDarkColors.*`. Never `Color(0x…)`, `Colors.*` or `Theme.of(context).colorScheme` defaults you didn't set. `primary` is the main call to action. `secondary` is AI, speech and audio. `tertiary` is success or a valid state. `error` is destructive or failed. `primaryContainer` is only a decorative wash, never body text on white. | `EqLightColors` |
| Type | Use `EqTextStyles.*`. On phones, the largest steps use the mobile variants (`displayMobile`, `headlineLgMobile`). Headings are 700–800 weight; body text is 400–500 with a generous line height. Labels and badges are uppercase with slight tracking. | `EqTextStyles` |
| Font | Plus Jakarta Sans. `ThemeData` names it, but the font files must be declared under `flutter: fonts:` in `pubspec.yaml`. If text renders in Roboto, the asset is missing: fix that before judging any screen. | DESIGN.md, Typography |
| Spacing | Use `EqSpacing` only: 16 at the screen edges (`marginMobile`), 12 between cards (`gutterMobile`), 24 inside cards (`lg`), 16 inside inputs and compact elements (`md`), 40 between sections (`xl`). No magic numbers. | `EqSpacing` |
| Shape | Use `EqRadius`: cards `lg` (16), buttons and inputs `md` (12), chips and badges `full`. | `EqRadius` |
| Elevation | A 2px `outlineStrong` border plus a hard offset shadow from `EqElevation.card` / `button` / `modal` / `inputFocus`. Never Material elevation, blur or `surfaceTint`. In dark mode the shadow disappears and the outline carries the depth. | `EqElevation` |
| Press | Physical press, no ripple. On press-down, translate the control by its shadow offset (3,3 for buttons) and drop the shadow, over 120 ms with `Cubic(0.2, 0, 0, 1)`. Disable the Material splash and highlight. Honour reduced motion (`MediaQuery.disableAnimationsOf`). | `press-button` in `apps/web/src/app/globals.css` |
| Icons | Outlined icons at 20 or 24. An icon-only control has a `tooltip` or `Semantics(label:)`. | |

## 3. No stock widget reaches the screen unstyled

Stock Material widgets are the main reason a screen looks unfinished. Every widget on screen is either:

- an `Eq*` widget from `lib/design/widgets/`, or
- a Material widget whose look comes entirely from `EqTheme`.

`EqTheme` (`lib/design/eq_theme.dart`) builds on the generated `eqLightTheme()` / `eqDarkTheme()` and adds the component themes with `copyWith`: `inputDecorationTheme`, `navigationBarTheme`, `appBarTheme`, `textButtonTheme`, `outlinedButtonTheme`, `dialogTheme`, `bottomSheetTheme`, `snackBarTheme`, `chipTheme`, `dividerTheme`, `progressIndicatorTheme`, and `splashFactory: NoSplash.splashFactory`. That file is where app-level styling goes. Never edit the generated `english_quest_tokens.dart`: token changes go in `tokens.json` followed by `pnpm tokens:build`.

**The widget library mirrors the web's.** Today it has `EqButton`, `EqCard`, `EqBadge`, `EqMeter`, `EqChip`, and `EqLoading` / `EqEmpty` / `EqError` (in `eq_page_state.dart`). The web also has TextField, Avatar, NavPill, Logo, icons and Empty/Error/Loading states in `apps/web/src/components/ui/`. Relative dates go through `core/format/relative_time.dart`, the twin of the web's `lib/relative-time.ts`. When a screen needs one that doesn't exist yet:

1. Read the web component first.
2. Add `Eq<Name>` in `lib/design/widgets/`, keeping the web's prop names and tone/variant vocabulary.
3. Add a widget test for it.

Never style something ad hoc inside a page. If two pages would need the same decoration, it is a widget.

## 4. Mobile layout checklist

Go through this list for every screen you touch:

- [ ] `Scaffold`, then `SafeArea`, with a horizontal edge padding of `EqSpacing.marginMobile`.
- [ ] Anything that can outgrow the screen scrolls (`ListView`, `CustomScrollView` or `SingleChildScrollView`), and forms stay usable with the keyboard open.
- [ ] **No fixed content widths.** Content fills the width (`CrossAxisAlignment.stretch`) and is capped for tablets with `ConstrainedBox(maxWidth: 560)` centred. A narrow fixed width is how a card ends up with one word per line.
- [ ] Text inside a `Row` sits in `Expanded` or `Flexible`. No fixed heights around text.
- [ ] One primary action per screen: a full-width `EqButton` in the thumb zone (at the bottom of the content, or pinned above the keyboard or nav bar for forms). Secondary actions are visually quieter.
- [ ] Touch targets are at least 48×48 dp, with at least 8 dp between adjacent tappables.
- [ ] Data screens handle every state through `EqLoading`, `EqEmpty` and `EqError`, using the same copy as the web where the web has the screen. Offline is an `EqError` carrying the `ApiException` message.
- [ ] Lists use `ListView.builder` or `.separated`, with cards spaced by `gutterMobile`.
- [ ] Web hover-only affordances become always-visible or pressed states. Web dialogs become bottom sheets, except destructive confirmations, which stay dialogs.
- [ ] Nothing below `bodySm` (12) for content. The layout survives text scaled to 1.3× without overflow.
- [ ] Light theme is the default. Dark must still render correctly: outlines visible, no leftover black shadows.

## 5. Verify

There is no emulator in the loop unless the user asks for one; the user reviews screens on their own device. Verification is:

1. `flutter analyze`, with 0 issues.
2. A widget test per screen that pumps it on a small phone (360×690 dp) and again with text scaled to 1.3×, and asserts the key content and the primary action are present. A `RenderFlex overflowed` error fails the test, which is the point. The snippet is in [references/web-to-mobile.md](references/web-to-mobile.md#layout-test-snippet).
3. `flutter test` passes in full.
4. A self-review against sections 2–4 and the mockup, then a final message that lists the translation decisions (from section 1) and anything you could not match.

## Related skills

The Flutter plugin skills (`flutter-build-responsive-layout`, `flutter-fix-layout-issues`, `flutter-add-widget-test`) and the global `flutter-building-layouts` / `flutter-theming-apps` are useful for generic mechanics. When they conflict with this skill (for example by suggesting Riverpod, GoRouter or plain `ColorScheme` theming), this skill and `apps/mobile/AGENTS.md` win.
