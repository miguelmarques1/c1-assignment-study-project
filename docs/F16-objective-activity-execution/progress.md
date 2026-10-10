# Implementation Progress: Objective Activity Execution

**Status:** success
**Branch:** claude/f16-objective-activity-execution-4c854b
**Started:** 2026-10-10
**Last updated:** 2026-10-10

## Stage 1: Contracts and Data Model — ✅ done

- [x] **1. Shared Activity Contracts and Error Codes**
- [x] **2. Attempt Table and Migration**
- [x] **3. Storage Range Reads**

**Observations:**
- The migration took number `0018_objective_attempts`: F17 landed `0017_writing_activities` and F18 `0016_speaking_activities` before this run, as the plan allowed for. The SQL is the spec's, verbatim.
- `ACT001`–`ACT006` were free on this branch (F17 and F18 used `WRIT`/`SPEAK`), so the numbering is the spec's.
- `parseByteRange` lives in its own file (`storage/byte-range.ts`) so it is unit-testable without the S3 client; `StorageService.getObjectStream` stats the object first (missing vs unreachable), then issues the ranged `GetObject`.
- `ObjectiveSubmissionInput.answers` is capped at 5 here (at most one per question); the exact-coverage rule is the grader's (`answerIssues`).
- Docker Desktop was stopped at the start of the run; it was started and answered by Stage 1, so integration suites can run.
- Environment: `@msgpack/msgpack` is missing from this worktree's `node_modules` (F14 dependency), so `pnpm --filter @english-quest/api typecheck` reports two `TS2307` errors in `frequency-list-builder`. Pre-existing and unrelated; every other file typechecks.

**Validation:** shared build ✅ · api typecheck: only the 2 pre-existing `@msgpack/msgpack` errors · lint ✅ (touched files, zero warnings) · unit `activity-contracts` + `byte-range` + shared suite ✅ (21 + 7). The migration is exercised by the integration suites from Stage 3 (Testcontainers applies it from scratch).
**Commit:** b95b0dd F16 stage 1 - contracts and data model

## Stage 2: Correction and Outcome Core — ✅ done

- [x] **4. Question Checks and Projection**
- [x] **5. Answer Normalization and Grading**
- [x] **6. Profile Outcome Builder**
- [x] **7. Session Context**

**Observations:**
- All modules are pure and live under `apps/api/src/activities/objective/`, plus `activity.constants.ts`.
- `buildActivityOutcome` takes the **item's** target tags (not the plan activity's up-to-5 subset): F12's note for F16 says "per item target tag", and F12 drops tags outside the taxonomy anyway. Stage 3 passes `payload.targetTags`.
- `projectQuestion` builds each view field by field, so a field added to the stored question shape cannot leak by default (A3).
- `checkQuestion` classifies a schema-valid ordering/matching question as `format_unavailable` before looking at its key, so a defective ordering key is not reported as a curator defect F16 cannot judge yet.
- A fill-in-the-blank blank is `/_{3,}/` (F13's marker), not exactly three underscores.
- Test fixtures shared by the unit specs live in `test/unit/objective-test-data.ts`.

**Validation:** typecheck ✅ (only the pre-existing `@msgpack/msgpack` errors) · lint ✅ · unit 36/36 ✅ (question-check 8, normalization 7, grading 8, outcome 10, session-context 3).
**Commit:** 5fb452c F16 stage 2 - correction and outcome core

## Stage 3: Activity Services and Routes — ✅ done

- [x] **8. Attempt Repository and Service**
- [x] **9. Skip and Rating**
- [x] **10. Activity View**
- [x] **11. Listening Media**
- [x] **12. Routes, OpenAPI and Wiring**
- [x] **13. Curator Signals**

**Observations:**
- **F15 defect fixed (additive):** `PlanActivityStateService.resolveForOwner` documented `lineage` as the whole carry-over chain, but only walked forward from the id it was given. A runner holding the newest copy's id (what the plan view returns after a carry-over) could not see an attempt started on an older copy, so resume failed. It now walks back to the oldest copy first; the existing forward walk is unchanged. Covered by `plan-activity-state::resolves_the_whole_chain_from_the_id_of_any_copy` and F16's `an_attempt_started_before_carry_over_resumes_on_the_carried_copy`. F18's use of `lineage[0]` as the task root becomes the true root when called with a newer id, which is what its spec intends.
- `buildActivityOutcome` receives the **item's** target tags (`payload.targetTags`), as decided in Stage 2.
- `ObjectiveAttemptService.start` returns an existing attempt before the archived-plan check, so a graded or open attempt on a replaced plan stays readable (A9); a brand-new attempt there is `PLAN004`.
- The view re-grades the stored answers against the attempt's snapshot instead of persisting a result blob; grading is deterministic, so the result reads the same forever, and `results` stays a small per-question record for `content:stats`.
- `GET /activities/:id/media` sets `Content-Length`/`Content-Range`/`Cache-Control` through `res.set` and returns a bare `StreamableFile`; the content type is F13's `mediaContentType` for the stored extension.
- Curator stats window is F14's 90 days (`GENERATION_STATS_WINDOW_DAYS`), passed in as `since`.
- OpenAPI snapshot: `openapi:generate` (tsx) fails silently again (the F10/F11/F15 follow-up), so the snapshot was written through a throwaway vitest file calling `buildOpenApiDocument`, which keeps SWC's decorator metadata. The git diff is large only because the new paths shift the following sections.
- Integration fixtures: `activity-fixtures.ts` listens once on an ephemeral port (`app.listen(0)`) so concurrent requests share the server; with the default supertest behaviour two simultaneous calls fight over bind/close and one gets `ECONNREFUSED`.

**Validation:** typecheck ✅ (only the 2 pre-existing `@msgpack/msgpack` errors were fixed by `pnpm install`; clean now) · lint ✅ · API unit 98 files / 791 tests ✅ · integration: `activity-routes` 14/14, `objective-submission` 15/15, `activity-media` 6/6, `content-stats` 7/7, `plan-activity-state` and `plan-activation` ✅ against real Postgres, Redis and MinIO.
**Soft-fail:** the spec says the integration suites boot the fake Gemini to assert it saw zero calls. They do not; `no_ai_call_is_made_from_open_to_rating` asserts zero `prompt_execution` and `credential_usage` rows for the user instead, and the fixtures give users no Gemini key, so any call would have surfaced as `CRED002`.
**Commit:** 795676c F16 stage 3 - activity services and routes

## Stage 4: Web Runner — ✅ done

- [x] **14. Web Data and Pure Helpers**
- [x] **15. Audio Player Primitive and Icons**
- [x] **16. Activity Shell**
- [x] **17. Objective Runner and Results**
- [x] **18. Activity Pages and Today**

**Observations:**
- **Registries already had F17/F18 entries.** `activity-routes.ts` now maps the five bank kinds to `/activities/{id}` next to the existing `writing`, `speaking` and `pronunciation` entries. Because all eight kinds are routable, the spec's example "next is writing without a route → Back to Today" cannot occur with real data; `nextStep` is tested with an unknown kind standing in for an unregistered one, and `Back to Today` is also tested for a finished session.
- **F18 shipped a `DifficultyRating` widget first** (`components/activity/difficulty-rating.tsx`, an inline row). F16 adds `RatingPrompt` (three large buttons, `Not useful` link, `Not now`) as the spec describes and leaves F18's widget untouched; merging the two is a follow-up.
- `Dialog` and `PlayIcon` also existed (F17/F18), so only `PauseIcon`, `CrossCircleIcon` and `AudioPlayer` were added to the primitives.
- `useObjectiveRunner` keeps its mutable bits (view, answers, attempt id, in-flight start, settled flag) in refs so the retry, online and backoff paths always see the latest values. The draft is reconciled in an effect (storage is unavailable while rendering on the server), so the first paint is a skeleton.
- A start call that returns a different fingerprint than the page was rendered with (the item was re-imported meanwhile) clears the answers, resets to question 1 and shows `This activity was updated, so your answers were cleared.`; a submission already in flight at that moment goes back to `answering` instead of sending answers for the old questions.
- `AUTH003` from any runner call keeps the draft and sends the browser to `/login?expired=1`, the same destination the server layouts use.
- Tailwind arbitrary variants (`has-[...]`) are rejected by `no-raw-values`; the option cards use `focus-within:` instead.
- The design-system gallery gained an `Audio player` section (a runtime-built silent WAV for the ready state, a missing file for the error state) and the two new icons. The Playwright visual baselines for the gallery were not regenerated (Docker `visual` service not run here): follow-up.
- Existing `today-session-card` test that asserted "no Start session while the registry is empty" was replaced by `shows_start_session_for_a_routable_objective_activity` and `shows_resume_session_when_the_next_activity_is_in_progress`.

**Validation:** web typecheck ✅ · eslint zero warnings ✅ · new specs 57/57 ✅ (`activity-draft`, `activity-navigation`, `audio-player`, `activity-shell`, `activity-runner`) · `today-session-card` 9/9 ✅ · full web suite 338/341 under load, the three failures (`no-raw-values` inline-style scan, `token-resolution`, an unrelated `credential-card` test) are 5-second timeouts from running the whole suite in parallel and pass when run alone (20/20).
**Soft-fail (runtime):** the runner page was not yet exercised in a browser against the running stack in this stage; see the final verification.
**Commit:** 3d21aeb F16 stage 4 - web runner

## Stage 5: Mobile Runner and Follow-Ups — ✅ done

- [x] **19. Mobile Models, API and Pure Helpers**
- [x] **20. Mobile Design Widgets and Shell**
- [x] **21. Mobile Runner Page**
- [x] **22. Follow-Up Notes in Finished Features**

**Observations:**
- **`just_audio` was already declared** in `pubspec.yaml` (F18 added it for attempt playback) and F18 has its own `AttemptAudioPlayer` for local files. F16 adds the spec's `AudioPlayback` interface (`core/audio/audio_playback_service.dart`, streaming over HTTP with headers) and `EqAudioPlayer` beside it rather than reusing F18's file-oriented class. `pubspec.lock` was stale for it, so `flutter pub get` refreshed the lock.
- **Mobile `DifficultyRatingWidget` already existed** (F18). `RatingPrompt` is the spec's new widget (large buttons, `Not now`) and leaves F18's untouched; merging the two is a follow-up shared with the web.
- The activity module is mounted at the app root (`/activity/:activityId`) with the same session guard as the shell, so there is no bottom navigation. `activityRoutes` maps the five bank kinds to `/activity/{id}`.
- File layout is leaner than the spec's list: `question_widgets.dart` (multiple choice, fill-in-the-blank, unscored, dots), `results_view.dart` (results and tile), `session_progress.dart`, `skip_activity_sheet.dart`, `rating_prompt.dart`, `passage_pane.dart`, `submission_status.dart`, `activity_unavailable.dart` and `palette.dart` (the light/dark colour roles the runner reads). The listening layout lives in the page. Behaviour is the spec's.
- `EqTextField` and `EqAudioPlayer` wrap themselves in a transparent `Material`, so they work outside a `Scaffold`. `EqTextField.hint` is helper text only (an earlier version also used it as the placeholder and showed it twice).
- Layout: passage pane capped at 30% of the screen height on top, questions scrolling below, the primary action pinned at the bottom. The spec's 45% proved too tall on a 360×690 phone with the header and progress bar.
- Large-text pass (1.3×) found one overflow in the rating prompt's two links; they now sit in a `Wrap`.
- Step 22: dated follow-up notes were appended to the progress files of F12, F13, F14 and F15, including the correction to `resolveForOwner` found in stage 3.

**Validation:** `flutter analyze` ✅ no issues · `flutter test` 273/273 ✅ (new: models, reconciliation/navigation/draft store, controller 13, page 11 on 360×690 and 1.3× text, rating prompt 4, `EqAudioPlayer` 6, `EqTextField` 5, Today `Resume session`) · `flutter build apk --debug` ✅ (final verification).
**Commit:** b73a1be F16 stage 5 - mobile runner and follow-ups

## Final verification

**Status: success.** Every check below is green, passed in isolation after a load-induced failure, or is a failure that does not touch F16 code and is listed as pre-existing.

**Full suite (2026-10-10):**
- `pnpm -r typecheck` ✅ · `pnpm lint` ✅ (zero warnings).
- Shared 7/7 ✅ · API unit 98 files / 791 tests ✅ · web 49 files / 341 tests ✅ · Flutter `analyze` ✅ and `test` 273/273 ✅ · `flutter build apk --debug` ✅.
- API integration (all 51 files, real Postgres, Redis and MinIO through Testcontainers): 545 passed, 13 skipped, 6 failed. F16's own suites are green inside that run: `activity-routes` 14, `objective-submission` 15, `activity-media` 6, `content-stats` 7, plus `plan-activity-state` and `plan-activation` with the `resolveForOwner` fix.
  - **Failed under load, green alone (3 files, 34 tests):** `pronunciation-routes::reports_each_status_truthfully`, `analysis-routes::reports_each_status_truthfully` and `profile-pipeline` (13 skipped after a failed `beforeAll`). The log shows Prisma connection errors while the machine was running containers for the whole suite; rerun on their own they pass.
  - **Pre-existing, unrelated to F16 (4 tests):** these fail inside the F17/F18 tests' own seeding or setup, before any route F16 touches runs.
    - `speaking-activity-routes::a_carried_activity_keeps_its_task_and_attempts`: `seedSpeakingActivity` creates a second plan for the same user, lesson and origin, violating `(user_id, lesson_id, origin)`.
    - `speaking-activity-routes::a_non_speaking_activity_is_not_found`: the test rewrites a pronunciation activity to `writing` and violates `ck_plan_activities_item`.
    - `speaking-rescore::refused_audio_is_not_rescorable`: the upload returns `not_enough_speech` instead of `audio_rejected` (F18's audio path).
    - `lesson-privacy::there_is_no_export_route`: the OpenAPI scan rejects F18's `/speaking/attempts/{attemptId}/audio`, because its regex bans any path containing `audio`. F16's `/activities/{activityId}/media` does not match it.
    These were judged pre-existing by reading them; they were not rerun against the base commit. F17's progress already records that its API integration suites could never run (no Docker).

**Component Overview walk-through:** every file in the spec's lists exists with the described role and contracts. The mobile widgets are consolidated into fewer files than the spec lists (`question_widgets.dart` holds the multiple-choice, fill-in-the-blank, unscored and dots widgets; `results_view.dart` holds the results and the per-question tile; the header and the listening layout live in `activity_runner_page.dart`). That is a deviation in file layout only, recorded under stage 5.

**Acceptance criteria** (each mapped test passed in this final run): the Core half of the formats criterion, no AI call (`no_ai_call_is_made_from_open_to_rating`), the transcript half of the listening criterion, the reading text staying visible, per-question feedback, case-insensitive and whitespace-tolerant matching, completion recording with the prompt version, occurrences within 5 s, the encounter, failed-submission handling, and duplicate-submission deduplication. The three cross-feature criteria and the design-system composition criterion (`no-raw-values`, `token-resolution`, `flutter analyze`) are covered as the spec maps them.

**Deviations from the spec**
- Ordering and matching, cross-device resume and the replay limit stay deferred (spec A1/A2/A6), with their criteria covered by the Core halves the spec names.
- The "next is writing without a route" example cannot occur with real data any more (all eight kinds are routable); tested with an unknown kind instead.
- The integration suites assert zero `prompt_execution` and `credential_usage` rows instead of booting the fake Gemini.
- Mobile passage pane is capped at 30% of the screen height, not 45%.
- The activity module's mobile widgets are consolidated (above), and `AudioPlayback` is new beside F18's `AttemptAudioPlayer`.
- `resolveForOwner` (F15) now also walks back through a carry-over chain (stage 3).

**Soft-fails**
- **Runtime smoke in a browser or on a device was not done.** The compose stack was not brought up for this worktree (isolated ports and a long container install, per the worktree notes). What does exercise the surface: every route against real Postgres, Redis and MinIO in the integration suites; the web runner through component tests; the mobile runner through widget tests at 360×690 and 1.3× text; the APK compiles. The listening player has not been heard on a real device or browser, and the `<audio>` cookie authentication across ports `:3000` and `:3001` has only been reasoned about.
- The Playwright visual baselines for the design-system gallery (new `Audio player` section and two icons) were not regenerated (Docker `visual` service not run).

**Follow-ups**
1. Smoke the runner end to end on the compose stack, with a curated listening item and a seeded plan: web (cookie audio), mobile on a device (bearer-header audio).
2. Regenerate the Playwright baselines for `design-system`.
3. Merge F18's `DifficultyRating` widgets (web `difficulty-rating.tsx`, mobile `difficulty_rating.dart`) with F16's `RatingPrompt`.
4. Fix the four pre-existing integration failures above (they belong to F17/F18's tests).
5. Ledger example links to the activity (F12 A27) once F16-F18 runners are all registered, now unblocked.
6. Optional: `EqTheme`'s app-wide `inputDecorationTheme` could adopt `EqTextField`'s look (spec A29).
