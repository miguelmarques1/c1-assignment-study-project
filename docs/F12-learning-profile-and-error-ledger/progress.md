# Implementation Progress: Learning Profile and Error Ledger

**Status:** in progress
**Branch:** claude/learning-profile-error-ledger-44d9aa
**Started:** 2026-09-25
**Last updated:** 2026-09-26

**Run setup:** the worktree branch was fast-forwarded to `main` (`f90378a`, F11 closed) before the run, and `spec.md` / `plan.md` were copied in from the main checkout, where they were untracked. F19 is implemented concurrently in another worktree on the same base, so this run takes F12's "F19 has not landed" path everywhere the spec offers one, and leaves the shared `english-quest` compose stack (which bind-mounts the main checkout) untouched: integration suites run on Testcontainers, and live checks use an isolated stack or read-only queries.

## Stage 1: Contracts, taxonomy and data model — ✅ done

- [x] **1. Shared contracts**
- [x] **2. Taxonomy version 2**
- [x] **3. Data model and migration**
- [x] **4. PRD alignment**

**Observations:**
- `packages/shared/src/schemas/profile.ts` is new with every schema the spec lists, plus two it implies: `competencySubScoresViewSchema` (the Pronunciation `subScores` object, named so the OpenAPI component and the Dart model have a type to mirror) and `ledgerListQuerySchema` (`tag`, 3–64 characters, the list route's `VAL001`). `ledgerSourceKindSchema` (`lesson` / `activity`) is shared by the example and source views. `pipeline.ts` gained `plan_generation`; `codes.ts` gained `PROF001` (404, `This error record could not be found.`). No client references a stage name yet (F19 adds the labels), so nothing else needed the new stage.
- **Taxonomy symbols confirmed live, not from the local database:** the dev database holds no `lesson_excerpt_assessments` rows at all (every earlier live check deleted its scratch lessons), so the spec's "confirm against the local assessments" had nothing to read. Instead, one real Azure pronunciation call (`TEST_AZURE_SPEECH_*` from `.env`, the F10 precedent) on an offline Windows TTS clip written to cover the inventory, through the project's own `PronunciationAssessmentClient`, with a throwaway script deleted afterwards. It returned 40 distinct symbols; a second short clip ("I like my time…") returned the missing `aɪ`. All 41 match the spec's list exactly, and the two open code points resolve as: **`g` is ASCII U+0067** (not `ɡ` U+0261), and `ɝ` (U+025D) and `ɚ` (U+025A) are both emitted. `ɹ` is U+0279.
- `error-taxonomy.yaml` is v2: family `phoneme` (label `Pronunciation`, `analysis: false`, `format: ipa`) with 41 tags labelled `/θ/ as in "think"` and a one-sentence description each; 77 tags in total. The header comment was rewritten (it still promised a `pronunciation` family and cited the slug-only pattern).
- The loader validates each tag against its family's format (`slug` `^[a-z]+:[a-z0-9-]+$`, `ipa` `^[a-z]+:/[^/\s]{1,4}/$`). Families gain a resolved `format` (default `slug`), and the loaded result gains `familyOf: ReadonlyMap<tag, family>`. **Fingerprint:** `format` joins a family's tuple only when it isn't `slug`, so v1's pinned fingerprint is still what v1 hashes to; v2 is pinned at `0b04072773…`. `the_analysis_tags_are_unchanged_by_v2` proves more than the spec asked: v2 minus the phoneme family hashes to v1's exact pin, so the three analysis families are byte-identical to v1 (F11's prompt `enum` and boot check untouched).
- `ErrorTaxonomyService` gained `has`, `familyOf` (null for unknown or retired) and `tagsInFamily`.
- Migration `0012_learning_profile` is the spec's SQL verbatim. The two stage checks' names were confirmed against `0011` (`ck_stages_stage`, `ck_branches_stage`). **Deviation (FK names):** the spec asks for `fk_*` names, but every earlier migration declares foreign keys inline and lets Postgres name them `<table>_<column>_fkey`, which is also Prisma's default `map`; the spec's own SQL block is inline too. Kept the codebase's convention, so `schema.prisma` needs no `map:` on any relation.
- `schema.prisma` gained the seven models and the back-relations on `User`, `Lesson` and `LessonUtterance`. `prisma format` was deliberately **not** run: it realigns 134 lines of unrelated models. `updated_at` on the new tables is `@default(now())` and written explicitly by the engine, not `@updatedAt`.
- **Migration not applied to the shared dev database** — deliberately. F19 runs concurrently against the same `english-quest` stack (which bind-mounts the main checkout, not this worktree), and applying `0012` there would put a migration in `_prisma_migrations` that the main checkout's code does not have. The migration is proven by Testcontainers instead (every integration suite applies every migration from scratch; `health.spec.ts` ran green with it), and the live checks in stage 7 use an isolated stack. The container-side `prisma generate` step is moot for the same reason.
- PRD: F12's taxonomy sentence now reads "about 40 grammar, vocabulary and discourse tags, plus one pronunciation tag for each en-US phoneme Azure reports", with `phoneme:/ɹ/` in place of the `stress:word-level` example (A13, A14).
- `docs/api/openapi.json` regenerated now, since the stage enum and the error-code list changed (F10/F11 precedent). The `tsx` script still exits 1 silently (the `emitDecoratorMetadata` gap F10 recorded); generated through `pnpm build` + `node dist/openapi/generate.js`. Diff: `plan_generation` in three enums, `PROF001` in the code list.
- Setup noise: `pnpm --filter @english-quest/design-tokens tokens:build` (needed in a fresh worktree) rewrites the three generated token files with LF endings; they were restored, not committed.

**Validation:** typecheck ✅ (all 4 projects) · lint ✅ · API unit 258/258 ✅ (`openapi.spec.ts` failed once on the stale snapshot, green after regenerating) · `error-taxonomy.spec.ts` 13/13 ✅ · `health.spec.ts` (Testcontainers, applies `0012` from scratch) 4/4 ✅
**Commit:** `c3d73ba` F12 spec/plan and stage 1 - contracts, taxonomy and data model

## Stage 2: Profile engine — ✅ done

- [x] **5. Scoring and ledger rules**
- [x] **6. Ingestion contract and service**
- [x] **7. Readers and compact summary**

**Observations:**
- `profile.constants.ts` holds A32's values plus what the engine needed alongside them: `PROFILE_UPDATE_RETRY_POLICY` (A12, kept here rather than a separate profile-update constants file the spec doesn't list), `PROFILE_TRANSACTION_TIMEOUT_MS` (30 s, the runner's own completing-transaction timeout), `PROFILE_TAGS_LIMIT`, the competency order and labels, the source kinds with `weightOf` / `measurementSourceKindOf`, and both partial-update sentences verbatim from the spec.
- `profile-fold.ts`: `foldCompetency` sorts by `measured_at`, `created_at`, `id` and folds A4's formula, clamping to 0–100. Sub-scores fold at the row's weight and skip nulls; a row without a sub-score **carries the previous smoothed sub-score forward** into `accuracy_after` / `prosody_after` (null until one exists) — the spec leaves that column's meaning open for such rows, and carry-forward is what F20's chart can plot without gaps. `roundScore` (half up) and `scoreDelta` are exported for the route.
- **Gotcha:** `weight` round-trips through a `real` column as 0.3499999940…, so the refold snaps it back (`Math.round(w·1e6)/1e6`) before folding; otherwise a refold would drift from the fold that wrote the row. The refold rewrites only rows whose after-values moved by more than 1e-4, so an in-order arrival updates one row, not the whole log.
- `ledger-rules.ts`: the spec's `selectRecurring(entries, now, isRetired)` became `selectRecurring(entries, isRetired)` over entries that already carry `recentOccurrenceCount`; the window arithmetic lives in `windowCounts(occurredAt[], now)` (recent = within 30 days inclusive, previous = the 30 before), which `tagTrend` and the reader share, so the arrow and the count can't disagree.
- `profile-summary.ts`: `renderCompactSummary(competencies, weaknesses, examples, budget?)` — the snapshot argument is its competency list, and `budget` is a parameter so the drop order is testable. Maximal input (120-char labels, 500-char quotes, 77 tags) renders under the budget with nothing dropped. Example lines are only for tags in the included weakness list, so an example can never smuggle in history beyond the caps.
- `profile-ingestion.contract.ts`: `activityOutcomeSchema` accepts `occurredAt` as a `Date` or an ISO string (in-process callers will pass dates; the spec's example is JSON). `profileSourceInputSchema` also enforces the origin coherence the table's CHECK enforces, and that correct encounters come only from activities. `activitySource` maps an outcome to a source; the caller never supplies a weight.
- `ProfileIngestionService`: lock = `INSERT … ON CONFLICT DO NOTHING` + `SELECT … FOR UPDATE` on `learning_profiles`, then the spec's steps. Found while writing it: a replaced source's **encounter** tags must be re-aggregated too, not only its occurrence tags — an encounter that goes away can take a record from `practicing` back to `new`. Rejected tags are logged with user, kind, key and the activity type, never a quote (asserted). `rebuild` refolds the union of logged and materialized competencies and re-aggregates the union of logged and recorded tags, so hand-deleted evidence leaves nothing stale.
- `LearningProfileReader.snapshotFor` also returns `empty`, which the view needs; `updatedAt` is null unless at least one source exists (the lock row alone doesn't count). `measurementHistory`'s `limit` keeps the most recent points, still returned oldest first. The partial-update note follows A10 exactly: the most recent lesson source is pronunciation-only and that lesson's `lesson_analysis` stage row is `blocked_missing_key` or `failed`.
- `ErrorLedgerReader` gained `latestExamples(userId, tags)` for the summary service (one quote or word list per tag, in rank order) and a public `isRetired`. `dueEntries` is a real query (`due_at <= now`, not mastered, not retired), empty in Core because nothing sets `due_at`.
- `ProfileModule` provides and exports the engine, both readers, the summary service and the (still neutral) tags port; it imports `TaxonomyModule` only.
- Fixtures: `helpers/pipeline-fixtures.ts` gained `seedUser`, `seedLesson`, `lessonSourceInput`, `seedProfileSource` and `makeProfiledLesson` now rather than in step 12, since the engine suite needs them. The engine suite uses the plain `createTestContext()` (no MinIO): the test app never calls `ensureBucket`, so it touches nothing outside its own containers.

**Validation:** typecheck ✅ · lint ✅ · API unit 287/287 ✅ (29 new: fold 10, ledger rules 8, summary 6, contract 5) · `profile-ingestion.spec.ts` 15/15 ✅ (Testcontainers)
**Commit:** `72ff79d` F12 stage 2 - profile engine

## Stage 3: Lesson ingestion and seams — ✅ done

- [x] **8. Lesson source mapping**
- [x] **9. Profile update stage and pipeline order**
- [x] **10. Reconciliation job**
- [x] **11. Profile seams**
- [x] **12. Adapting earlier suites** — F11's `completion_advances_to_profile_update` now waits for `profile_update` completed and the branch at `plan_generation`; the drain's no-handler test moved to `plan_generation`; F09's focus fake is structural; `FAST_PROFILE_UPDATE_RETRY_POLICY` in the fixtures; the backoff unit test pins 5 s / 30 s; `pipeline-routes.spec.ts`'s `retry_reruns_downstream_stages` race fixed (below).

**Observations (2026-09-26, interrupted run):**
- The run was interrupted by a usage limit after this stage's code was written and resumed the same day; the full integration suite then ran to completion before the commit.
- **Pre-existing flaky test fixed:** `pipeline-routes.spec.ts > retry_reruns_downstream_stages` failed 3/3 in this worktree with 409 instead of 202. Running it on the pre-F12 main checkout (read-only, Testcontainers) showed it also fails there intermittently (1 of 3): it waited for `pronunciation_assessment` to complete, then failed transcription by hand, but F11's `lesson_analysis` job still ran afterwards (blocking at once, Ana holds no Gemini key) and moved the pointer off the hand-made failure. The test now also waits for `lesson_analysis` to reach `blocked_missing_key`, which is what its own comment ("let every downstream stage's first run settle") intended. 3/3 green after the fix. Not an F12 regression, but recorded here because F12 is where it got fixed.
- F10's `StoredPronunciationResultSummary` gained `id` and F11's `StoredAnalysisError` gained `id` (additive): the result row and the analysis row are the sources' revisions, and the error id is `analysis_error_id`.
- `profile-update/`: `lesson-profile-sources.ts`, `profile-update-stage.handler.ts` (both sources applied inside `context.complete`; missing inputs throw → `internal_error` after retries), `profile-reconciliation.job.ts` (`run()` takes no `now`: the sweep is time-independent; anti-join on `revision = r.id::text`, oldest lesson first, 50 per tick), `profile-update.module.ts`; `plan_generation` appended to `PIPELINE_STAGE_ORDER`; `ProfileUpdateModule` in `AppModule`.
- Seams: `ProfileTagsPort` real (recurring, analysis families, top 10); `PronunciationFocusPort` moved to `profile/` (old file deleted, F09 imports repointed, `ExcerptSelectionModule` imports `ProfileModule`), source `ledger@1` even with no tags (the ledger was consulted); `ErrorLedgerPort` created (F19 not landed) counting occurrences with `occurred_at <= lesson start`.
- `apps/api/AGENTS.md`'s neutral-port example now points at `recording/study-plan-fallback.port.ts`.
- Suites that delete intervals for determinism: `profile-pipeline.spec.ts` (reconciliation) and `profile-seams.spec.ts` (reconciliation and drain), following `recording-finalization.spec.ts`.
- The fault test was strengthened beyond the spec: a persistent trigger fault → 3 attempts → `failed` / `internal_error` with no partial rows and no lock row → the owner's retry through `PipelineService.retry` completes at run 2.

**Validation:** typecheck ✅ · lint ✅ · API unit 292/292 ✅ · full API integration suite 343/344 on the first run, the one failure being the pre-existing race above; `pipeline-routes.spec.ts` 12/12 ✅ three times after the fix. New suites: `profile-pipeline.spec.ts` 13/13, `profile-seams.spec.ts` 6/6, `lesson-profile-sources.spec.ts` 4/4.
**Commit:** _(recorded in the next stage's commit)_

## Stage 4: Routes and document — ⬜ pending

- [ ] **13. Profile routes**
- [ ] **14. OpenAPI document**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 5: Web profile screen — ⬜ pending

- [ ] **15. Navigation and design reference**
- [ ] **16. Profile screen**
- [ ] **17. Ledger detail dialog**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 6: Mobile profile screen — ⬜ pending

- [ ] **18. Mobile primitives**
- [ ] **19. Profile models and controller**
- [ ] **20. Profile page and detail sheet**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 7: Verification and hand-off — ⬜ pending

- [ ] **21. Live verification**
- [ ] **22. Follow-ups for neighbouring features**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_
