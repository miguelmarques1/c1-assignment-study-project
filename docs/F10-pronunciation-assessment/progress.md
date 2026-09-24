# Implementation Progress: Pronunciation Assessment

**Status:** in progress
**Branch:** main
**Started:** 2026-09-24
**Last updated:** 2026-09-24

## Stage 1: Contracts, runner extension and data model — ✅ done

- [x] **1. Shared contracts**
- [x] **2. Data model and migration**
- [x] **3. Runner extension**
- [x] **4. PRD alignment**

**Observations:**
- `packages/shared/src/schemas/pronunciation.ts` is new: `pronunciationScoresSchema`, `excerptPronunciationSchema` (status + scores, identical shape on the badge and the route), `worstPhonemeSchema`, `worstWordSchema`, `pronunciationExcerptViewSchema`, `lessonPronunciationViewSchema`. `pipeline.ts` gained `lesson_analysis`, `pronunciationFailureCodeSchema` (folded into `stageFailureCodeSchema`), and `progress` on `pipelineStageViewSchema`. `excerpt.ts`'s `transcriptExcerptSchema` gained a required `pronunciation` field.
- Making `pronunciation` required on the transcript badge immediately affects F09's already-committed `transcript.service.ts`. Rather than defer wiring the real reader (Stage 4, step 14), the badge now returns a placeholder `{ status: 'pending', scores: null }` for every excerpt, so the contract change stays typecheck-clean end to end from Stage 1 onward. Step 14 replaces the placeholder with `PronunciationResultReader`'s real per-excerpt status and scores. Adapted `transcript-merge.spec.ts` and `transcript-routes.spec.ts`'s `marks_the_callers_selected_utterances_with_their_excerpt` for the same reason.
- Migration `0010_pronunciation_assessment` is the spec's SQL verbatim: `progress_done`/`progress_total` on `lesson_pipeline_stages`, widened `ck_stages_stage`/`ck_stages_reason_code`/`ck_branches_stage`/`ck_branches_failure_code`, and the two new tables `lesson_excerpt_assessments` and `lesson_pronunciation_results`. Applied locally; `schema.prisma` mirrors it with two new models (`LessonExcerptAssessment`, `LessonPronunciationResult`) and back-relations on `User`, `Lesson`, `LessonExcerpt` (`assessment`) and `LessonExcerptSelection` (`pronunciationResults`).
- Runner extension: `StageRunContext` gained `withinRun(write)` and `reportProgress(done, total)`. `PipelineStateService.withinRun` locks the stage row `FOR UPDATE` (the `role-card.service.ts` pattern) inside a transaction, checks `run` and `status === 'running'`, and throws `StaleRunError` otherwise; `setProgress` is `withinRun` plus one update. Progress resets to `null` only in `queueStage` and the private `requeue` (both increment `run`) — not in the shared `CLEARED` object used by `markRunning`/`markRetrying`/etc., so progress survives an in-run attempt retry (the stage's own 60s/300s backoff) and is only cleared when a fresh run starts, matching "reset whenever a stage is re-queued." No dedicated unit test for the guard yet — the spec defers that to F10's own integration suite (`a_stale_run_writes_nothing`, `progress_counts_settled_excerpts`) in Stage 3, since no stage besides the not-yet-built F10 handler calls `withinRun`/`reportProgress`.
- `PIPELINE_STAGE_ORDER` now ends `..., pronunciation_assessment, lesson_analysis`, one feature early per the established F08/F09/F10 pattern — no handler is registered for `lesson_analysis` yet, so a branch reaching it just waits, like `pronunciation_assessment` did before this run.
- PRD alignment: `docs/prd.md`'s F10 Capabilities ledger sentence now reads "recorded as pronunciation tags … on the lesson's result, which the error ledger (F12) ingests …". The Section 9 acceptance-criterion wording ("Phoneme failures are written to the ledger as `phoneme:` tags") is unchanged, per the spec.
- Regenerated `docs/api/openapi.json` now (not deferred to Stage 4 step 15) because the pipeline and transcript contracts already changed (`progress`, badge `pronunciation`) and `test/unit/openapi.spec.ts` guards staleness on every run. Stage 4 step 15 will regenerate again once the pronunciation route and component exist.

**Validation:** typecheck (api, web) ✅ · lint ✅ · unit 177/177 ✅ · integration (pipeline-routes 12/12, pipeline-drain 8/8, transcript-routes 11/11, excerpt-selection-pipeline 14/14, transcription-pipeline 15/15, recording-to-transcription 3/3) ✅
**Commit:** _(pending — recorded after Stage 2 commits, per the skill's convention)_

## Stage 2: Azure pronunciation capability — ⬜ pending

- [ ] **5. Pronunciation client**
- [ ] **6. Response mapping and clip capability**
- [ ] **7. Live endpoint check**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 3: Pronunciation stage — ⬜ pending

- [ ] **8. Clip slicer**
- [ ] **9. Aggregation rules**
- [ ] **10. Excerpt store and result writer**
- [ ] **11. Stage handler and pipeline order**
- [ ] **12. Adapting F09's suites**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 4: Routes and document — ⬜ pending

- [ ] **13. Pronunciation route**
- [ ] **14. Transcript badge and pipeline progress**
- [ ] **15. OpenAPI document**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 5: Verification and hand-off — ⬜ pending

- [ ] **16. Live verification**
- [ ] **17. Follow-ups for neighbouring features**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_
