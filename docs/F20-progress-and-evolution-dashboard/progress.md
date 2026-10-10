# Implementation Progress: Progress and Evolution Dashboard

**Status:** success
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

**Validation:** `flutter analyze` ✅ 0 issues · `flutter test` 254/254 ✅ (new: chart model 21, models 4, page 14, segmented control 3, profile 1, navigation 1) · `flutter build apk --debug` ✅ (`app-debug.apk`, 714 s on a cold Gradle cache)
**Commit:** `1f0f581` F20 stage 3 - mobile progress screen

## Stage 4: Design reference, verification and hand-off — ✅ done

- [x] **14. Design reference and live verification**
- [x] **15. Follow-ups for neighbouring features**

**Observations:**
- `design/README.md`: `Nível de Domínio` is `dropped` (Section 7, Pedagogy), `Tempo de Conversação` stays `deferred` to F20's Full Scope with A16's reason, and the pill row says Profile is prefix-matched. `design-reference.spec.ts` passes with a deferred `Stat card` row still present.
- **Live API check (isolated stack `eq-f20`), as Ana and as Bruno** (two accounts sharing four seeded lessons): the embedded `profile` equals `GET /profile` minus `serverTime` for both, every non-empty series ends on its snapshot score, the `since` boundaries are `serverTime` minus 90 and 30 days, Ana's response carries none of Bruno's tags and Bruno's grammar series is his own scores. Data was seeded through F12's ingestion service with a scratch script (kept outside the repo).
- **Web:** walked in Stage 2's observations (light, dark, 375 px, hover, isolate, table, entry card, active pill).
- **Mobile:** analyzer, the full test suite and a debug APK build. No emulator or device run, per `apps/mobile/AGENTS.md`; the user reviews the screen on their own device. Translation decisions for that review: no mockup existed for either client (A19), so the screen is composed from `Eq*` widgets. The web's crosshair tooltip became a tap or drag with a readout under the plot; `Show as table` became `Show as list` (cards instead of table rows); the legend is two columns instead of three; the weakness detail is a bottom sheet; the empty state has no `Open classroom` action because the live lesson is web-only.
- **Neighbouring logs:** dated, appended notes in F12's progress (ProfileService exported, recent improvements waiting, weakness row extracted) and F22's (the two stat cards settled).
- **Clean-up:** the `eq-f20` containers and volumes were removed, the generated `.env` deleted, and the local API and `next dev` stopped. The scratch data lived only in that throwaway database, so no `rebuild` was needed.

**Validation:** see Final verification.
**Commit:** the closing commit of this run (`F20 final verification - close the run`).

## Final verification

**Status:** success.

- **Typecheck** ✅ (shared, design-tokens, web, api) · **lint** ✅ (0 warnings) · **design-tokens** 17/17 ✅ · **web** 327/327 ✅ · **API unit** 752/752 ✅ · **mobile** analyze 0 issues, 254/254 ✅, `flutter build apk --debug` ✅.
- **Web suite flake:** run while the local servers and Gradle were using the machine, two scanning guards and one credential-card test hit vitest's 5 s timeout (`token-resolution`, `no-raw-values`, `credential-card`). After stopping them the guards passed, and `credential-card.spec.tsx` passes on its own (10/10). Nothing in F20 changed that test; the scanners simply read more files now.
- **API integration (full, Testcontainers):** 512 passed, 6 failed, 20 skipped across 49 files. `progress-routes.spec.ts` 13/13 ✅ in the full run. The failures are all outside F20's surface and were not re-run on the base commit; the only API source F20 touched outside its own module is `ProfileModule` (an added export), `AppModule`, and the OpenAPI components and tag:
  - `lesson-privacy.spec.ts > there_is_no_export_route`: F18's `GET /speaking/attempts/{attemptId}/audio` matches the test's `/audio/` regex. A conflict between F18 and an earlier guard, unrelated to `/progress`.
  - `pronunciation-routes.spec.ts` and `analysis-routes.spec.ts > reports_each_status_truthfully`: pipeline status timing under load.
  - `speaking-activity-routes.spec.ts` (2 tests, a Prisma query error) and `speaking-rescore.spec.ts > refused_audio_is_not_rescorable` (`not_enough_speech` where `audio_rejected` was expected): F18's audio path.
  - `transcription-pipeline.spec.ts` and `plan-generation-pipeline.spec.ts`: the Testcontainers reaper could not map its port in `beforeAll`, so all 20 tests skipped.
- **Component Overview walk-through:** every file in spec section 4 exists with its described role (tokens and DESIGN.md, `progress.ts`, the six API files and three wiring edits, the web route, loading, server and browser reads, chart model, six components, the segmented control with its gallery section and barrel export, profile entry card, header prefix match, the nine mobile files plus the profile module and extracted row, the README and OpenAPI snapshot). **Missing from spec: none.**
- **Acceptance criteria (PRD, F20)**, each re-run in this state:
  - ✓ line chart with last 20 and the three ranges: `keeps_the_newest_twenty_points_per_competency_oldest_first`, `range_boundaries_are_ninety_and_thirty_days_before_server_time`, `points_in_range_keeps_measurements_on_or_after_since`, `range_selector_changes_the_plotted_points` (web and mobile).
  - ✓ lesson and activity distinguished: `lesson_and_activity_points_carry_their_source_kind`, `markers_follow_the_source_kind`, `lesson_and_activity_points_use_different_markers`.
  - ✓ `Warming up` and no trend arrow: `warming_up_competencies_carry_no_trend`, `legend_tiles_show_score_trend_or_warming_up` (both clients).
  - ✓ explanatory empty state: `chartable_is_false_until_a_competency_has_three_measurements`, `fewer_than_three_measurements_shows_the_explanatory_empty_state` (both clients).
  - ✓ recurring weaknesses ranked with trend and chip: `recurring_weaknesses_are_the_profiles_ranked_list`, `renders_recurring_weaknesses_and_opens_the_detail`, `tapping_a_weakness_opens_its_sheet`.
  - ✓ both clients render the same data and ranges: one server view, the shared chart case table passing in both languages, the same 21 / 21 / 13 counts from one fixture.
  - — Recent improvements: **blocked on F12's Full Scope** (A2); `has_no_recent_improvements_region_in_core` proves it is absent rather than empty.
  - — 10 worst phonemes, domain coverage, activity statistics: **deferred to the Full Scope** (spec Scope).
  - Cross-feature: ✓ F12→F20 consistency (`the_embedded_profile_equals_get_profile`, `the_last_point_equals_the_snapshot_score`), ✓ activity outcomes appear as points (`an_activity_outcome_appears_as_an_activity_point`), ✓ F21 tokens-only screens (`no-raw-values`, `token-resolution`, `renders_tokens_only`, `flutter analyze`, the six chart pairs in the token suite). F15 and F06→F20 criteria: deferred with the Full Scope.
- **Soft-fails:**
  - The `visual` Playwright service was not run: it recreates the `english-quest` stack's `web` and `api` containers, which belong to another checkout and session, and it serves that checkout's code, not this worktree's. `segmented-control-light.png` and `segmented-control-dark.png` are therefore not generated, and the `visual.spec.ts` block list already names `segmented-control`, so that spec fails on a missing baseline until someone generates them.
  - No emulator or device run of the mobile screen (as above); the mobile chart was verified through widget tests and a build, not by eye.
  - No live check of the web as the second user in the browser (the API was checked as both users).

**Open follow-ups:**
1. Generate the gallery baselines for the segmented-control block in both themes (`docker compose up -d visual`, `docker compose exec visual npx playwright test --update-snapshots --workers=1`) from the main checkout after merging, then restart the dev servers the `visual` service recreates.
2. Review the mobile Progress screen on a device (chart legibility, drag selection, the list view).
3. Triage the six API integration failures listed above on the base commit (most look environmental; the `there_is_no_export_route` one needs F18's audio route allowed or the test regex narrowed).
4. F20 Full Scope: activity statistics, rating distribution, phoneme list, domain coverage, and the `Tempo de Conversação` decision (A16).
5. When F12's Full Scope adds `recentImprovements`, add the region to the progress page (A2).
6. The vitest 5 s default timeout is tight for the two source-scanning web guards on a loaded machine; consider a per-test timeout.
