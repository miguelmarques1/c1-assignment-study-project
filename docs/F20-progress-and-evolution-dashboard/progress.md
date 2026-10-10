# Implementation Progress: Progress and Evolution Dashboard

**Status:** in progress
**Branch:** claude/progress-evolution-dashboard-d6eb36
**Started:** 2026-10-10
**Last updated:** 2026-10-10

**Run setup:** the worktree is `spec-writer-f13-86d5f2` (branch above), already at `main`'s tip with F12, F15, F21 and F03 closed as `success`. Docker Desktop was off at the start and was started for the run, so Testcontainers suites run. The shared `english-quest` compose stack bind-mounts the main checkout, not this worktree, so it is left untouched; live checks use an isolated stack (see Stage 4).

## Stage 1: Tokens, contract and the progress route — ✅ done

- [x] **1. Chart colour roles**
- [x] **2. Shared contract**
- [x] **3. Progress route**
- [x] **4. Route behaviour and privacy**

**Observations:**
- `tokens.json` gained `chart-1` … `chart-6` in both themes (A14 values) and six `chart-N-on-surface-container-lowest` border pairs at 3:1. All six pass the existing token suite as written, so no value was re-stepped and the exemption registry stays empty. `pnpm tokens:build` rewrites the generated files with LF in a `core.autocrlf=true` checkout; the diff is additions only.
- `DESIGN.md` gained a `Data visualization` subsection under Palette Architecture (CRLF file, written with CRLF).
- `progress.ts` in `packages/shared` follows the spec's table. `measurementSourceKindSchema` duplicates the values of F12's `ledgerSourceKindSchema` on purpose: one describes where a chart point came from, the other where a ledger example did, and they may diverge.
- `ProfileService` is now in `ProfileModule`'s `SHARED` list (provided and exported) instead of being provided separately. `GET /profile` is unchanged.
- `ProgressService.getDashboard` reads the profile and the six histories in parallel (`Promise.all`) with the same `now`.
- The worktree's Prisma client was stale (missing speaking models), so `typecheck` failed until `npx prisma generate` ran in `apps/api`. Setup noise, not part of the change.
- `pnpm openapi:generate` exits 1 silently (the known `tsx` gap), so the snapshot was generated through `pnpm build` and `node dist/openapi/generate.js`. Diff: one operation (`GET /progress`), one component (`ProgressDashboardView`), the `progress` tag.
- Integration tests are the spec's list one for one. `an_activity_outcome_appears_as_an_activity_point` asserts 86 (0.85 × 90 + 0.15 × 60 = 85.5, half up).

**Validation:** typecheck ✅ · lint ✅ · API unit 752/752 ✅ (5 new) · `progress-routes.spec.ts` 13/13 ✅ (Testcontainers) · design-tokens 17/17 ✅
**Commit:** `14124be` F20 stage 1 - tokens, contract and the progress route

## Stage 2: Web progress screen — ✅ done

- [x] **5. Chart model**
- [x] **6. Segmented control primitive** — baselines for the gallery not regenerated yet (see Observations)
- [x] **7. Data layer and route**
- [x] **8. Chart card**
- [x] **9. Progress screen and navigation**

**Observations:**
- `progress-chart.ts` follows the spec's function table, plus the pieces the renderer needed: `plotRect` (the margins, shared with the Dart twin), `seriesInRange`, `countPoints` and `Y_TICKS`. The visible set is an array kept in the profile's order (`toggleCompetency` re-sorts), so the twin can compare lists directly. `timeTicks` returns a single instant for a single-instant domain. `xOf` clamps to the plot, so a point a hair past `serverTime` (clock skew) cannot leave it. Two extra cases beyond the spec's table (`x_and_y_are_linear…`, `a_lesson_sorts_before_an_activity…`); the Dart twin must repeat them.
- **Fixture:** `apps/web/test/fixtures/progress-view.json` is the API envelope (`{ data }`) so the mobile scripted adapter can serve it as is. Lesson points are at 12:00Z (not the spec example's 18:00Z) so every viewer time zone from UTC-12 to UTC+11 formats the same calendar day. Counts: 21 points all time and 90 days, 13 in 30 days, five moments, four lessons and one activity.
- **Pointer events:** the plot listens to `mouseenter`-family events (`onMouseMove`/`onMouseLeave`), not `pointermove`, because jsdom delivers `clientX` only on mouse events; touch taps on the web fire them too.
- **A11y lint:** the plot is a `role="group"` with a tab stop and key handlers, which `jsx-a11y` rejects (`no-noninteractive-element-interactions`, `no-noninteractive-tabindex`). Disabled for that one file with the reason in the header comment; no ARIA role fits a keyboard-operable chart.
- **Token guard:** `border-b`, `border-collapse` and `border-transparent` do not resolve to a token. The table uses `border-b-2`, relies on preflight for collapse, and the unselected segmented option uses `border-surface-container` (the container's own colour).
- The profile entry card sits first inside the ready fragment, above the notes. `ChartIcon` is the existing icon.
- **Segmented control at phone width:** at 375 px three options wrapped to two lines with `px-md`; the primitive now uses `px-sm` below `md`.
- **Live check (isolated stack, `eq-f20`):** Postgres, Redis and MinIO in compose project `eq-f20` on shifted ports (5452, 6399, 9020), the API built from this worktree running on the host at :3021 (with `WEB_ORIGIN` set to the web's port, which the CORS check needs) and `next dev` at :3020, with a generated `.env` (gitignored). Two seeded accounts and profile data through F12's ingestion service (four shared lessons across 95 days plus two activity outcomes for Ana, one recurring weakness). Walked in the preview pane as Ana: the entry card on `/profile`, the progress page, the `Profile` pill active, the hover tooltip and crosshair, tile isolation and `Show all`, the table view (with `—` and lesson-date links), the phone width (375 px, three ticks, two-column legend, one-line selector) and the dark theme. No console errors from the page.
- **Not yet done for this stage:** the gallery's visual baselines for the segmented-control block (`e2e/visual.spec.ts` lists the block; the PNGs are generated by the `visual` service in Stage 4).

**Validation:** typecheck ✅ · lint ✅ · web tests 327/327 ✅ (47 files; new: chart model 21, chart 7, screen 12, primitive 1, shell 1, profile 2) · token guards ✅ · live run ✅ (above)
**Commit:** `8397ec1` F20 stage 2 - web progress screen

## Stage 3: Mobile progress screen — ✅ done

- [x] **10. Dart models and chart model twin**
- [x] **11. Segmented control widget**
- [x] **12. Chart and legend widgets**
- [x] **13. Progress screen and routing**

**Observations:**
- `progress_chart_model.dart` repeats every case of the web table by the same name, plus the web's two extras. Differences by language only: `seriesRole` returns the 1-based role number, the visible set is a `List<ProfileCompetency>` in enum order, `ChartDomain` holds epoch milliseconds, `timeTicks` returns doubles like the web. The fixture is `test/features/progress/progress-view.json`, a byte copy of the web's, and `the_fixture_counts_match_the_web` asserts 21 / 21 / 13 on it.
- **Widgets:** `EqSegmentedControl<T>` (one Semantics node per option: button, mutually exclusive group, selected; 48 dp). `CompetencyChart` is a `CustomPaint` in a `LayoutBuilder` with tap-down and horizontal-drag selection; the plot's semantics label is the summary and the painted content is excluded. The readout under the plot is the live region (`Tap the chart to see a measurement.` until a moment is selected). `CompetencyLegend` is a two-column `Wrap` of tiles, each `toggled` for the pressed state. `MomentsList` is the list alternative; a lesson row opens `/app/lessons/{id}`, an activity row has no page and is not a button.
- **Colours** come only from `EqLightColors/EqDarkColors.chartN` through `ChartPalette`; no literal `Color(…)`. The painter lists the lines and markers in the same shape rules as the web (circle 8, diamond 10, 2 px ring in the card surface).
- **Routing:** the flat `/profile` route became `profileModule` (`/` and `/progress`) inside the shell; the tab's prefix match already keeps Profile selected (`profile_tab_stays_selected_on_progress`). Progress is pushed with `pushNamed`, as the Plan history is. Both pages take an optional callback so tests observe navigation without a router.
- **Weakness row** extracted to `features/profile/widgets/weakness_row.dart` and made public with a `key` parameter; `profile_page.dart` otherwise unchanged. The entry card is the whole tappable `EqCard`, announced as a button.
- **Test gotchas:** `find.text('Fluency')` must be scrolled into view before a tap (the plot pushes the tiles below the fold on a 360×690 phone). `▶ Steady` appears in the legend and in the weakness row, so that count is 2.
- Not done: no emulator or device run (the user reviews on their own device, per `apps/mobile/AGENTS.md`). `pubspec.lock` was rewritten by `flutter pub get` and is not committed.

**Validation:** `flutter analyze` ✅ 0 issues · `flutter test` 254/254 ✅ (new: chart model 21, models 4, page 14, segmented control 3, profile 1, navigation 1) · `flutter build apk --debug`: result recorded in Stage 4
**Commit:** _(see Stage 4's commit)_

## Stage 4: Design reference, verification and hand-off — ⬜ pending

- [ ] **14. Design reference and live verification**
- [ ] **15. Follow-ups for neighbouring features**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_
