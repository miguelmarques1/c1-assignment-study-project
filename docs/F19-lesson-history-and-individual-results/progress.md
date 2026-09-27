# Implementation Progress: Lesson History and Individual Results

**Status:** success
**Branch:** claude/lesson-history-individual-results-3cc933
**Started:** 2026-09-25
**Last updated:** 2026-09-27

## Stage 1: Contracts and route extensions — ✅ done

- [x] **1. Shared contracts**
- [x] **2. Ledger seam**
- [x] **3. Analysis view extensions**
- [x] **4. Pronunciation and transcript extensions**

**Observations:**
- **Run setup.** This worktree's branch was created at F04 while `main` had already reached F11, and the F19 spec/plan existed only as untracked files in the main checkout. The branch was fast-forwarded to `main` (`f90378a`, a strict ancestor, clean tree — no merge commit) and `spec.md`/`plan.md` were copied in and are committed with this stage. F12 is being implemented concurrently in another worktree; nothing here touches its files beyond the shared seams the two specs already coordinate (`ErrorLedgerPort`, stage labels).
- **Windows path-length gotcha, worth knowing for any worktree with a long name.** `pnpm install` in this worktree put vite's `package.json` at exactly 260 characters (`…\lesson-history-individual-results-3cc933\node_modules\.pnpm\vite@7.3.6_@types+node@…\node_modules\vite\package.json`), and Node then fails with the misleading `ERR_PACKAGE_IMPORT_NOT_DEFINED: "#module-sync-enabled"` — it silently cannot read the file that defines the import. Fixed locally, with nothing committed, by reinstalling with `pnpm install --frozen-lockfile --config.virtual-store-dir-max-length=40`, which shortens the `.pnpm` folder names. The F12 worktree's name is 4 characters shorter, which is why it doesn't hit this.
- **Docker compose project name is fixed** (`name: english-quest` in `docker-compose.yml`), so running `docker compose` from a worktree would recreate the main checkout's containers with this worktree's bind mount, under F12's feet. This run never calls `docker compose` against that project; integration suites use Testcontainers (random ports, isolated), and the live check in Stage 5 must use its own `-p` project and shifted ports.
- Shared: `lessons.ts` is new (statuses, flags and their labels, summary, list, query, coarse stages, detail). `lessonScenarioStatusSchema` (F06's four plus `none`) lives in `scenario.ts` rather than `lessons.ts`, beside the new `lessonScenarioViewSchema`, to avoid a circular import; the spec only said "F06's status … or `none`". `LessonScenarioView.status` uses the same enum, so a lesson without a scenario row (pre-F06) reads `none` there too — the spec was silent on that case for this route. `pipelineStageLabels` has no `plan_generation` entry: F12 has not landed on `main`, so per the spec F12 adds it (the `Record` type forces it).
- `LESSON_LIST_DEFAULT_LIMIT` / `LESSON_LIST_MAX_LIMIT` are exported from the shared package (the query schema needs them); `lessons.constants.ts` in Stage 2 re-uses them instead of redefining them.
- `ErrorLedgerPort` (`profile/error-ledger.port.ts`) returns an empty map; `ProfileModule` provides and exports it. `AnalysisService` asks it once per view with the distinct tags of the caller's errors, and builds `recurrence` only from 2 upward.
- `correctionSegments` compares tokens NFKC-lowercased with every non-letter/digit stripped, so `doesn’t`/`doesnt` and `known,`/`known` match; a token that is only punctuation keeps its raw text as its key, so two unrelated dashes never "match" through an empty key. Backtracking prefers skipping a quote token on ties, which keeps the earliest correction tokens in the LCS.
- `overall.delta` rounds both sides before subtracting and uses `PronunciationResultReader.previousAssessedFor`, which filters `status = 'assessed'` — the `no_sample` lesson in between is skipped (tested). `assessedWords` is only built when the badge's status is `assessed` and words were stored.
- `transcript-merge.spec.ts`'s badge fixture gained `assessedWords: null` (the contract now requires it); `transcript-routes.spec.ts`'s `marks_the_callers_selected_utterances_with_their_excerpt` expectation gained the same field.
- `pronunciation-routes.spec.ts` showed a **pre-existing, load-induced flake** twice while other suites were running in parallel on this machine: `reports_each_status_truthfully` takes ~10 s, and when it passes the 15 s `PIPELINE_DRAIN_INTERVAL_MS` the drain enqueues the deliberately-idle "pending" lesson, which then fails (no audio); `badges_carry_the_same_scores_as_the_section` failed the same run. Neither touches F19's code path (the pipeline itself fails before any read). A clean, unparallelized run is 10/10, and `reports_each_status_truthfully` passes in isolation. Lesson learned for later stages: don't run heavy suites concurrently here.
- OpenAPI regenerated through `pnpm build` + `node dist/openapi/generate.js` (the `tsx` script still exits 1 silently, the F10/F11 follow-up); the snapshot changes only in the extended components, still 24 operations.

**Validation:** typecheck (shared, api, web) ✅ · lint ✅ · api unit 265/265 (14 new: correction-diff 6, recurrence-label 1, pronunciation-words 2, plus existing) ✅ · web 126/126 ✅ · integration: `analysis-routes` 11/11 (2 new) ✅, `transcript-routes` 12/12 (1 new) ✅, `pronunciation-routes` 10/10 (1 new) ✅ on a clean run (2 load-induced flakes on concurrent runs, recorded above) · openapi snapshot fresh ✅
**Commit:** bb90d61 "F19 spec/plan and stage 1 - contracts and route extensions"

## Stage 2: Lesson history API — ✅ done

- [x] **5. Status, headline and cursor rules**
- [x] **6. History routes**
- [x] **7. Past-lesson scenario route**
- [x] **8. Privacy suite and OpenAPI document**

**Observations:**
- `lesson-status.ts`, `lesson-headline.ts` and `lesson-cursor.ts` are pure, per the spec. `STORAGE_UNAVAILABLE_REASON` moved from a private constant in `pipeline.service.ts` to an export of `pipeline.constants.ts`, so F08's view and F19's history share the one sentence without the pure module importing a Nest service.
- `deriveLessonStatus` takes a `BranchSnapshot` whose stage rows have an **optional** `reason`: the caller's branch is selected with `reason` and `failureReason`, another participant's (`OTHER_BRANCH_SELECT`) without them, so the coarse path is fed data that physically lacks the private fields rather than trusting the projection to drop them. A blocked branch whose stage row is somehow missing falls back to `Blocked — add your key in Settings to continue.` (not in the spec, which assumes the row exists — it always does in practice).
- `deltasByLesson` compares each dimension with the latest measurement whose `startedAt` is **strictly** earlier, exactly `previousFor`'s `lt`; two lessons with the same start never compare with each other. `the_list_headline_matches_the_detail_deltas` pins the list's sentence to `headlineText` applied to the numbers the analysis and pronunciation routes return.
- **Deviation:** `GET /lessons/:lessonId` answers `CLASS004` for a lesson outside the history set (`waiting`, `live`, `abandoned`, or never started), not only for non-participants. The spec is silent; the summary contract requires a non-null `startedAt`, and a lesson the list never shows has no history entry. `GET /lessons/:lessonId/scenario` has no such restriction — it works for any lesson the caller took part in, including the open one (tested against F06's view).
- The list's `totalStorageBytes` is one `aggregate` over every participant row of every lesson the caller would see (all pages), and each page is batch-loaded with a constant 5 queries (participants, own branches, scenarios, both score timelines) plus the page query itself.
- `scenario-view.ts` (`situationOf`, `ownCardOf`) is now the only place either scenario view builds its situation and card; F06's `buildView` uses it and its suites (`scenario`, `scenario-generation`) stay green. `ScenarioModule` imports `PipelineModule` for `LessonAccessService`.
- `helpers/history-fixtures.ts` (`makeHistoryLesson`) constructs a lesson in any resting state directly: branches with realistic stage rows (every check constraint satisfied, including `ck_stages_reason`, `ck_stages_blocked_provider`, `ck_stages_finished`), transcript, excerpts with assessments, pronunciation result, analysis with errors, scenario and cards. Lessons start an hour apart in creation order unless `startedAt` is given.
- **A privacy-test pitfall worth recording:** pronunciation scores are Postgres `real` (float32), so a value written as `44.17` comes back as `44.16999816894531`. A test that searches a response for the literal it wrote passes vacuously. `lesson-privacy.spec.ts` derives the forbidden strings from the other participant's rows as actually read back and serialized, and also asserts the reader's *own* scores and markers do appear, so absence is never an empty response.
- The retry test (`retry_reruns_the_failed_stage_and_downstream_reusing_upstream`) runs the real F08–F11 stages with fake speech, pronunciation and Gemini: analysis run 1 → 2, transcription/selection/assessment `run` unchanged, speech calls stay 1 and pronunciation calls unchanged, `profile_update` queued again, and the list row goes `failed` → `ready`.
- Routes were exercised through the real Nest app (HTTP, session guard, Postgres, Redis, MinIO) in the integration suites; the check against the running dev stack is Stage 5's.

**Validation:** typecheck ✅ · lint ✅ · api unit 284/284 (19 new: lesson-status 11, lesson-headline 6, lesson-cursor 2) ✅ · integration: `lesson-history-routes` 19/19 ✅, `lesson-scenario-route` 5/5 ✅, `lesson-privacy` 3/3 ✅, `scenario` + `scenario-generation` + `pipeline-routes` 44/44 ✅ · openapi snapshot regenerated, 27 operations (3 new), fresh ✅
**Commit:** 8b6c735 "F19 stage 2 - lesson history API"

## Stage 3: Web lesson history — ✅ done

- [x] **9. Web data layer and formatting**
- [x] **10. Primitive extensions** (visual baselines deferred to Stage 5, see below)
- [x] **11. Lesson list, navigation and dashboard**
- [x] **12. Lesson detail frame and result area**
- [x] **13. Scenario and transcript areas**
- [x] **14. Status area and retries**
- [x] **15. Design reference update**

**Observations:**
- Web typecheck passes over the uncommitted files (2026-09-26). No web test, lint or token guard has been run on them yet.
- Planned design for the rest of the stage (from reading the codebase): detail pages under `app/(app)/lessons/[lessonId]/` with `params` as a Promise (Next 15); each area reads its own route through `lessons-server.ts` and shows only its own error state; the result area shows the status panel when analysis is not ready but always shows the pronunciation section; transcript expansion and `#u-{id}` highlighting in a client component; retries through `lib/lessons.ts` with PIPE001 → silent refresh, PIPE002 → recording retry, REC001/REC002 → inline message. Token guard limits to remember: no `ml-auto`, no `border-dotted`, no bracket values, spacing only `xs…xl`.
- _2026-09-26, run resumed:_ the two notes above describe the paused state; the stage was then finished and validated as below. A scheduled task (`resume-f19-lesson-history`, every 2 h at :15) now resumes this run automatically if a usage limit interrupts it again; it does nothing while any worktree file changed in the last hour or once the Status line is final.
- **Composition for testability:** each area is a plain component (`ResultArea`, `ScenarioArea`, `TranscriptView`, `StatusArea`) taking `ServerRead<T>` results, and the `app/(app)/lessons/[lessonId]/**/page.tsx` files are thin server reads around them — so the component suites render every area with typed fixtures (`test/fixtures/lessons.ts`), including one area failing while the others render.
- **Deviation — shared `Meter`:** negative deltas now print `▼ −N` with U+2212 (previously ASCII `-`), because the spec's result test expects `▼ −2`. F21's `meter_delta_states_its_direction_in_text` was updated to match. This also changes the gallery's `Pronunciation` meter rendering, so the meter's visual baseline changes twice over (the new null-delta row as well).
- **Deviation — `SituationCard`:** its four reroll props became one optional `reroll` object; the classroom's `scenario-region.tsx` passes it, and the past-lesson Scenario area omits it, so the button and its notices are absent there. F06's `scenario-panel`/`scenario-visibility` suites stay green.
- `NavPill` stays on plain `<a>` links (unchanged primitive behaviour), so switching areas is a full navigation; the header's `Lessons` destination uses `matchPrefix` so it stays active on a lesson's detail. The detail's section pill uses `label="Lesson sections"` and `alwaysVisible`.
- Dates render through `LocalizedTime`, a client component that prints a fixed UTC form on the server's render and the viewer's local text after mount, so server HTML and hydration always agree and calendar days are the viewer's (A19). `lib/relative-time.ts` takes the time zone as a parameter; the case table pins `UTC` plus an `America/Sao_Paulo` case where the two disagree.
- The past-lesson Scenario area shows a note instead of `RoleCardPanel` when the caller's card is missing or still `pending` — the panel's "Preparing your role card…" makes no sense after the lesson.
- The recurrence `Badge` renders only when the API sends `recurrence` (always null until F12); the tag chip is plain text (A14).
- The `Recent lessons` dashboard block is recorded in `design/README.md`'s dashboard table (not in the mockup; F05's and F07's Experience clauses), and the header-pill row names `Lessons` and F12's future `Profile` slot.
- **Soft-fail (deferred to Stage 5):** the Playwright visual baselines for the gallery's meter block were not regenerated. The `visual` service runs under the default `english-quest` compose project, which the concurrent F12 session uses; it will be run under a separate `-p` project with the live check.
- **Soft-fail (deferred to Stage 5):** the pages were not yet exercised against a running stack (that is Stage 5's live verification). `next build` compiles every lesson route (`/lessons`, `/lessons/[lessonId]` and its three sub-routes) with no server/client boundary error.

**Validation:** web typecheck ✅ · lint ✅ · web 167/167 (41 new across `lesson-format` 4, `lesson-list` 7, `lesson-result` 9, `lesson-scenario-area` 3, `lesson-transcript` 5, `lesson-status-area` 8, `lesson-detail-no-audio` 1, plus 4 in `ui-primitives`/`app-shell`) ✅ · guards `no-raw-values`, `token-resolution`, `design-reference` ✅ · `next build` ✅ · visual baselines ⏭️ deferred · live pages ⏭️ Stage 5
**Commit:** 931033f "F19 stage 3 - web lesson history"

## Stage 4: Mobile lesson history — ✅ done

- [x] **16. Mobile design widgets**
- [x] **17. Dart models and transport**
- [x] **18. Lesson list screen**
- [x] **19. Lesson detail screen**

**Observations:**
- **No mockup** exists for either screen (spec A24); both compose from `Eq*` widgets per `mobile-ui` case 3. Generating a Stitch mockup for the list and the result area is still recommended before the user's on-device review.
- **New primitives:** `EqMeter` (web `Meter`'s props; the web's `delta: null` becomes `noPreviousResult: true`, since Dart can't tell an omitted named argument from an explicit null — the one prop-shape deviation) and `EqChip` (tones and `count`). F12 has not landed, so F19 created both, plus `EqTheme.tabBarTheme` (outlined active tab like `NavPill`, no underline, tint or ripple); `EqTheme.light()/dark()` now apply it through `copyWith`.
- **Models** mirror every composed view with F19's extensions. `PipelineStage` is a value class over the wire string, so an unknown stage (F12's `plan_generation`) parses and renders humanized (`Plan generation`) instead of throwing — tested. `LessonRecordingView` keeps only the three fields the Status tab reads.
- `core/format/relative_time.dart` (shared with F12, A19) takes an optional `utcOffset` so the case table can pin the viewer's calendar day, exactly as the web's formatter takes a time zone; `lesson_format.dart` mirrors the web's formatters and both suites run the same case table.
- **Navigation:** `lessonsModule` replaces the placeholder route in `shell_module.dart`; the detail is `/app/lessons/:lessonId`, pushed with `context.pushNamed` inside the Lessons tab so the bottom navigation stays. The blocked stage's settings link switches tab with `context.navigate('/app/settings')`. Both pages take an optional `LessonsApi` and navigation callbacks so widget tests run without a Modular router.
- **Detail layout decision:** the header is the first item of every tab's scroll view (it scrolls away) and the four areas are a scrollable `TabBar` in the `AppBar` — instead of a `NestedScrollView` with a pinned header, which would take a fixed chunk of a 690 dp screen at 1.3× text and complicate scroll-to-utterance. The Transcript tab uses a `SingleChildScrollView` + `Column` (not a lazy list) so `Scrollable.ensureVisible` can always reach the anchored line from an error, a worst word or an assessed excerpt.
- **A real bug the widget tests caught:** the detail's `TabController` was `late final` with an initializer, so a detail that never showed its tabs (`CLASS004`) created it inside `dispose()` — "Looking up a deactivated widget's ancestor is unsafe". It is now created in `initState`.
- Polling (10 s) runs only while `TickerMode` is enabled (the tab is on screen) and something is pending; pull-to-refresh on every list and tab. Offline shows the `ApiException` message (`No connection`), any other failure names what could not be loaded.
- The tab bar scrolls on a 360 dp phone (four labels do not fit at 1.3× text); the tests bring a tab into view before tapping it.

**Validation:** `flutter analyze` 0 issues ✅ · `flutter test` 63/63 (new: `eq_meter` 3, `eq_chip` 1, `lesson_models` 2, `lesson_format` 3, `lessons_page` 6, `lesson_detail_page` 9) ✅ · `flutter build apk --debug` ✅ (271 s) · on-device review left to the user, per `apps/mobile/AGENTS.md`
**Commit:** b15d5d1 "F19 stage 4 - mobile lesson history"

## Stage 5: Verification and hand-off — ✅ done

- [x] **20. Live verification**
- [x] **21. Follow-ups for neighbouring features**

**Observations:**
- **Isolated stack, so F12's concurrent session was never touched.** Everything ran under a separate compose project, `eq-f19`, built from this worktree: `docker compose -p eq-f19 --env-file <scratchpad>/compose-f19.env up -d --build api web` with host ports shifted (web 3020, API 3021, Postgres 5452, Redis 6399, MinIO 9020/9021) and no LiveKit (history needs none; `/health` reads `degraded` for it, as expected). A worktree-local `.env` (gitignored, never committed) holds fresh secrets and two session-generated test accounts; `API_PORT` stays 3001 inside it because the same variable is both the host mapping and the port the API listens on, so the host port comes from the separate `--env-file`. `pnpm install` inside the new volumes took ~8 minutes. The project's containers are left stopped with their volumes (see Final verification) so a later run can reuse them.
- **Scratch data** came from a throwaway vitest spec (never committed, deleted) that called the committed `makeHistoryLesson` fixture against the dev Postgres: eight lessons with both test accounts — a previous ready lesson, ready, blocked at analysis, failed at analysis, too short, recording failed, partial + ended unexpectedly, and processing (`retrying` at transcription). All eight were deleted afterwards (`lessons` count 0).
- **API through the running server, as each user:** `GET /lessons` (8 rows each, own statuses — Ana `blocked` where Bruno is `ready`, Bruno `failed` with the no-branch sentence on the partial lesson where he has no branch), headlines matching the delta rule by hand (e.g. `Grammar +2 · Pronunciation +2`, pronunciation compared across the analysis-blocked lesson), `GET /lessons/:id` (others coarse: `cccccp`), `GET /lessons/:id/scenario` (own card and role only), a privacy spot check over all seven `/lessons/:id…` GETs (the other participant's card text in none), and `CLASS004` for an unknown id.
- The `processing` scratch lesson did not stay processing: the real F08 drain picked up its `retrying` transcription within a minute and failed it (`Recording could not be read from storage.` — no audio object exists for scratch data). That is F08's own behaviour, and the list showed it truthfully; processing rendering is covered by the component and widget suites.
- **Web pages:** the built-in browser pane was hidden for this session (`document.visibilityState: hidden`), so `requestAnimationFrame` never fires and React 19 never reveals streamed server content — pages stuck on the Suspense fallback. Not a product defect (the same pages render in a visible browser). The page checks were therefore run as a throwaway Playwright spec inside the `eq-f19` `visual` container (headless Chromium, never committed, deleted), signing in through the API and routing the browser's `localhost:3021` calls to the `api` service: list with every status and flag and relative dates, the dashboard's `Recent lessons` (3 rows, `See all lessons`), the result area, `See in transcript` → the anchored line highlighted, a badge expanded to banded words with `aria-label`s, the scenario area (own card, no other card's text, no reroll), the status area (own and Bruno's steppers), the blocked panel's `/settings` link, **a real `Retry`** on the failed analysis (the stage re-ran for real and ended `Blocked` — the scratch account has no Gemini key — which the refreshed stepper showed with its settings link), the not-available state, dark theme, and 375 px width with no horizontal overflow on five pages. 7/7 passed; 17 screenshots were reviewed and deleted. No `<audio>`/`<video>` anywhere.
- Next dev's first compile of each route took 10–30 s, which made the first navigation assertions time out once; a re-run with warm routes passed. Dev-only.
- **Visual baselines:** run serially (`--workers=1`; five parallel workers timed out against the dev server). Only `meter-light.png`/`meter-dark.png` changed because of F19 (the null-delta row and U+2212) and were regenerated and reviewed. Two **pre-existing** gaps surfaced and were deliberately left alone: `field-light/dark.png` are stale since F22 changed `field.tsx` without regenerating them, and `icons-*.png` / `login-screen-*.png` were never committed (the suite writes them as "missing" on first run). `badge-dark` failed once only because Next's floating dev indicator overlapped the block's edge — environmental.
- **Mobile:** `flutter analyze`, `flutter test` and `flutter build apk --debug` (Stage 4). One more fix during this stage: the mobile stepper iterated a fixed stage list, so F12's future `plan_generation` would not have shown; it now appends any stage the API returns that the build doesn't know, humanized (tested: `a_stage_this_build_does_not_know_still_shows`). The on-device review is left to the user.
- **Follow-ups (step 21):** dated notes appended to the progress logs of F07, F08, F09, F10, F11 and F22 (earlier notes untouched). The spec's notes for F12 gained an "as built" line (where the shared formatter, `EqMeter`/`EqChip` and the Dart stage labels live, and `EqMeter`'s `noPreviousResult`); the F15 note (stepper renders the shared order) and the F20 note (list domain = `lesson_scenarios.vocabulary_domain` for a ready situation) match what was built.

**Validation:** live API checks as both users ✅ · Playwright live page checks 7/7 ✅ (light, dark, 375 px, real retry) · visual suite: meter baselines regenerated ✅, `field-*` stale and `icons-*`/`login-screen-*` missing — pre-existing, left as found · mobile 65/65 ✅ · scratch data deleted ✅
**Commit:** d0b19a1 "F19 stage 5 - verification and hand-off"

## Final verification

_2026-09-26. Correction to Stage 5's validation line: the mobile suite is **64/64**, not 65/65 (63 at the end of Stage 4, plus `a_stage_this_build_does_not_know_still_shows`)._

**Full suite (whole repo, not filtered to this feature):**
- `pnpm -r typecheck` ✅ (shared, design-tokens, web, api) · `pnpm lint` ✅ (zero warnings)
- API, every unit and integration file in one serial run: **623/625** — the two failures were timing races in F08/F10 suites (`pipeline-routes` › `retry_reruns_downstream_stages`, the race F09's progress log already records; `pronunciation-routes` › `never_returns_another_participants_pronunciation`, the stage failing under load as in Stage 1's note). Both files re-run in isolation: **22/22** ✅, with no code change. Not attributable to F19 (its only touch to those paths is the moved `STORAGE_UNAVAILABLE_REASON` constant and read-only view fields), so they are recorded as pre-existing flakes, not regressions.
- Web **167/167** ✅ (including the `no-raw-values`, `token-resolution` and `design-reference` guards) · shared: no test files · mobile `flutter analyze` 0 issues ✅, `flutter test` **64/64** ✅, `flutter build apk --debug` ✅ (Stage 4)
- `packages/design-tokens` › `generated_files_match_a_fresh_generation` ✗ — **pre-existing**: the drift guard compares the generator's LF output with the CRLF files `core.autocrlf` checks out on Windows. F19 does not touch the package (`git diff main -- packages/design-tokens` is empty).

**Component Overview walk-through:** every file the spec lists exists with its described role; the three routes and the `LessonList`, `LessonDetailView`, `LessonScenarioView` components are in `docs/api/openapi.json`; `shell_module.dart` mounts `lessonsModule`; `design/README.md` names `Lessons` and the `Recent lessons` block. **Missing from spec: none.** Files added beyond the spec's list (all small, all to keep one job per file): web `components/lessons/{area-error,localized-time,links,lesson-header}.tsx|ts`, `result/result-area.tsx`, `status/status-area.tsx`; mobile `tabs/tab_body.dart`, `widgets/{palette,lesson_header}.dart`, `models/json_read.dart`; test helpers `history-fixtures.ts`, `fake-error-ledger.ts`, `test/fixtures/lessons.ts`, `test/helpers/{pump_screen,scripted_dio}.dart`.

**Acceptance criteria (PRD, F19) — every mapped test re-run in this final pass and passing:** all 14 F19 criteria and the 7 cross-feature rows the spec assigns to F19 (see the spec's Testing Strategy tables). The recurrence badge criterion is proven through the test-only `ErrorLedgerPort` fake, as A13 specifies, until F12 implements the port.

**Smoke checks:** the three new routes and every web page were exercised against a running stack in Stage 5 (isolated `eq-f19` project), including a real retry, dark theme and 375 px.

**Regressions:** none.

**Soft-fails:**
- The built-in browser pane was hidden for the whole session, so React never revealed streamed pages there; the page checks ran as a headless Playwright spec in the `eq-f19` `visual` container instead.
- Mobile was not run on a device or emulator (per `apps/mobile/AGENTS.md`); the on-device review is the user's.
- The optional real two-window lesson in the user's Chrome, followed to `Ready`, was not run (needs two browsers with WebRTC).
- No Stitch mockup exists for the history or result screens (A24); both clients compose from the design-system primitives.

**Pre-existing failures / gaps (left as found):** the design-tokens drift guard (CRLF); two timing-sensitive F08/F10 integration tests under full-suite load; stale `field-light/dark.png` baselines since F22; `icons-*.png` and `login-screen-*.png` baselines never committed.

**Follow-up work:**
- **F12** implements `ErrorLedgerPort.occurrencesThrough` (the badge then appears with no F19 change), wires the error-card tag chip to the ledger detail (A14), inserts `Profile` in the header pill between Dashboard and Lessons, and adds `plan_generation` to `pipelineStageLabels` and the Dart `PipelineStage._labels`.
- Regenerate the stale `field-*` baselines and commit the missing `icons-*` / `login-screen-*` ones in a visual-baseline chore (run serially: `--workers=1`).
- Fix the design-tokens drift guard's line-ending comparison, or add a `.gitattributes` `eol=lf` for the generated files.
- The `eq-f19` compose project (containers stopped, volumes kept) and the worktree's gitignored `.env` can be removed with `docker compose -p eq-f19 down -v` once no further live check is wanted.

## Merge with main (2026-09-27)

`origin/main` had gained F13 (content bank) and F12 (learning profile and error ledger), which was built concurrently on the same base. It was merged into this branch before the PR. F12 landed first, so this merge applied the six F19 wiring items F12's progress log lists (stage 7).

**Conflicts (19 files), resolved as follows:**
- Kept both sides, since both features appended at the same spot: `app.module.ts` (`LessonsModule`, `ProfileUpdateModule`, `ContentModule`), the Swagger tags, `openapi/components.ts`, the shared `index.ts` barrel, and the F09/F11/F22 progress notes (F12's first, then F19's).
- `profile/error-ledger.port.ts` and `profile.module.ts`: F12's versions. The ledger-backed port replaces F19's empty default, and the contract is identical. F11's F19 note records that the badge is now real.
- One module per client for relative time. Web `lib/relative-time.ts` and mobile `core/format/relative_time.dart` export `formatRelativeTime(value, reference, timeZone | utcOffset)` and `formatShortDate`, and F19's callers were renamed. The rules were already identical, and both case tables (F12's `relative-time` and F19's `lesson-format`) pass.
- `EqMeter`: F12's widget (hatched warming-up track, `eq-meter-warming-track` key), plus F19's `noPreviousResult` (em dash read as "no previous result") and U+2212 for negatives, matching the web `Meter`. F12's `showNullDelta` became `noPreviousResult`, and F12's web profile test now expects `▼ −1`. `EqChip`: F12's widget, which is functionally the same. The tests were merged into one file each. `pump_screen.dart`: F19's (a superset, with `dark`).
- The header pill is Dashboard, Profile, Lessons, Settings. Both header tests and `design/README.md`'s dashboard pill row now say so.

**F12 wiring applied (F12 progress, stage 7):**
1. Ledger lesson sources link to the lesson. On the web, `ledger-entry-sheet.tsx`'s `LESSON_DETAIL_HREF` constant is gone and a lesson source is a `Link` to `lessonHref(id)`. The test `lesson_examples_link_to_the_lesson` is back under its spec name. On mobile, `showLedgerEntrySheet` takes `onOpenLesson`: it defaults to `navigate('/app/lessons/{id}')`, and from a lesson's own detail the current lesson is a no-op.
2. The error-card tag chip opens the tag's record. The web wraps it in a `Link` to `/profile?tag={tag}`, named "{label}: open in your error ledger". On mobile, the chip is a 48 dp button that calls `showLedgerEntrySheetForTag`, and a failed lookup shows a snackbar. `LessonDetailPage` takes an optional `ProfileController`.
3. `plan_generation` reads `Plan generated` / `Generating plan` in `pipelineStageLabels` and the Dart `PipelineStage` (labels and order). The unknown-stage tests now use a hypothetical `weekly_review`.
4. Shared widgets and formatters reconciled (above).
5. Pill order (above).
6. The recurrence badge reads F12's port. The test-only fake stays for the view's badge rules. A new `profile-seams.spec.ts > the_lesson_result_badge_reads_the_real_ledger` proves the real path end to end: three earlier occurrences, then a real analysis and `profile_update`, and the result reads `4th time`.

**Adapted to F12's pipeline:** `plan_generation` is now the seventh stage everywhere (the API's coarse stages, the web and mobile steppers, and their fixtures). The real `profile_update` handler runs at once, so `retry_reruns_the_failed_stage_and_downstream_reusing_upstream` now waits for `profile_update` to complete rather than stay queued. The `Ready` rule (A3) is unchanged: a branch resting at `plan_generation` / `queued` is `Ready`.

**Validation after the merge:**

- `pnpm -r typecheck` ✅ (after `prisma generate` for F12's and F13's models) and `pnpm lint` ✅.
- API unit **367/367** ✅.
- API integration **427/427** ✅. The full serial run passed 408 across 35 files. `lesson-history-routes.spec.ts` failed its setup once on a Testcontainers reaper error ("Expected Reaper to map exposed port 8080", environmental) and passed **19/19** when re-run. The new `the_lesson_result_badge_reads_the_real_ledger` passed, and so did this time the two timing-sensitive F08/F10 tests from the final verification.
- Web **188/188** ✅, including the design-reference, token-resolution and no-raw-values guards.
- Mobile: `flutter analyze` 0 issues ✅, `flutter test` **79/79** ✅, `flutter build apk --debug` ✅.
- `docs/api/openapi.json` regenerated with `pnpm build` + `node dist/openapi/generate.js`: **30 operations**, F19's 27 plus F12's three `/profile` routes, and the `profile` and `lessons` tags.
- Pre-existing and unchanged: the design-tokens drift guard (CRLF).
- Not re-run: the live stack checks and the visual baselines. F12's only change to a primitive the baselines cover is `EmptyState`'s new `href` action, which leaves the button variant the gallery renders untouched, and the merged `Meter` is F19's, whose baselines were regenerated in Stage 5. On-device mobile review remains the user's.
