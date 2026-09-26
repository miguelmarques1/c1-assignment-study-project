# Implementation Progress: Lesson History and Individual Results

**Status:** in progress
**Branch:** claude/lesson-history-individual-results-3cc933
**Started:** 2026-09-25
**Last updated:** 2026-09-26

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
**Commit:** _(recorded in the next stage's commit)_

## Stage 3: Web lesson history — ⬜ pending

- [ ] **9. Web data layer and formatting**
- [ ] **10. Primitive extensions**
- [ ] **11. Lesson list, navigation and dashboard**
- [ ] **12. Lesson detail frame and result area**
- [ ] **13. Scenario and transcript areas**
- [ ] **14. Status area and retries**
- [ ] **15. Design reference update**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 4: Mobile lesson history — ⬜ pending

- [ ] **16. Mobile design widgets**
- [ ] **17. Dart models and transport**
- [ ] **18. Lesson list screen**
- [ ] **19. Lesson detail screen**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 5: Verification and hand-off — ⬜ pending

- [ ] **20. Live verification**
- [ ] **21. Follow-ups for neighbouring features**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_
