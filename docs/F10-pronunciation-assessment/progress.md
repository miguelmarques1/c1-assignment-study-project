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
**Commit:** d975049 "F10 spec/plan and stage 1 - contracts, runner extension and data model"

## Stage 2: Azure pronunciation capability — ✅ done

- [x] **5. Pronunciation client**
- [x] **6. Response mapping and clip capability**
- [x] **7. Live endpoint check**

**Observations:**
- `speech.constants.ts` gained `PRONUNCIATION_PROVIDER`, `pronunciationAssessmentUrl(region, locale)`, `PRONUNCIATION_ASSESSMENT_TIMEOUT_MS` (60 s) and `pronunciationAssessmentParams(referenceText)`. `pronunciation-assessment.client.ts` posts the WAV clip's raw bytes (not multipart, unlike fast transcription) with the base64 `Pronunciation-Assessment` header; `pronunciation-assessment.response.ts` validates and maps the detailed result; `pronunciation-assessment.service.ts` exposes `assessClip` through `CredentialExecutorService.withKey(userId, 'azure_speech', feature, …)`, matching `SpeechToTextService.transcribeFile`'s shape. `speech-errors.ts` gained `SpeechNoRecognitionError`. `speech.module.ts` provides and exports both new classes.
- **Live check finding (step 7), significant deviation from the spec's assumed shape:** the spec assumed Azure's detailed REST response nests every score under a `PronunciationAssessment` child object at the `NBest[i]` and `Words[i]` levels (the shape the SDK's config docs imply). The real response is flat: `NBest[i].AccuracyScore/FluencyScore/ProsodyScore/CompletenessScore/PronScore` and `Words[i].AccuracyScore/ErrorType` sit directly on their parent object, same for `Phonemes[i].AccuracyScore`. Verified with a real call against `TEST_AZURE_SPEECH_REGION=eastus2` using a local offline TTS clip (Windows `System.Speech.Synthesis`, 16 kHz mono PCM WAV, no extra dependency) as the source audio, and a throwaway script (deleted after the check, per the standing constraint) that called `PronunciationAssessmentClient` directly. Rewrote `pronunciation-assessment.response.ts`'s schema and mapper to the flat shape, and fixed `helpers/fake-pronunciation.ts` and the two unit test files to match, before they were ever run against the wrong shape in CI.
- **`PhonemeAlphabet: IPA` returns real IPA over REST** (`w`, `i`, `ʊ`, `ɹ`, `æ`, `ð`, `ɚ`, `θ`, `ŋ`, `tʃ`, …, confirmed in the live call's phoneme list). No SAPI→IPA fallback table was needed; the spec's contingency is unused and not built.
- **Prosody is reported for `en-US`** (`ProsodyScore` present, e.g. 68.7), and `Feedback.Prosody.Break.ErrorTypes` / `Intonation.ErrorTypes` are present per word (mostly `["None"]` / `["Monotone"]` on a flat-affect TTS clip), confirming the merge-into-`errorTypes`-dropping-`None` design.
- **An `Omission` word carries `Offset: 0`, `Duration: 0`, `AccuracyScore: 0.0`** rather than omitting those fields — confirmed live (the reference word "I" was never recognized because the TTS clip's phrasing shifted it into an inserted "we"). The response mapper treats all three as always-present-but-optional with safe fallbacks, which already covered this case correctly without further change.
- **Ticks confirmed as 100 ns units** (10,000 ticks = 1 ms) — the mapped `offsetMs`/`durationMs` values lined up with the clip's own ~7 s duration.
- Wired `helpers/fake-pronunciation.ts` (scripted per key **and** per reference text, since F10 assesses several excerpts with different reference texts per branch) into `helpers/pipeline-fixtures.ts`'s `createPipelineTestContext` now — `PipelineTestContext` gained a `pronunciation` fake — since it is needed both by this stage's `speech-to-text.spec.ts` extension and by Stage 3's pipeline suite; building it once now avoided a rework later. `PRONUNCIATION_EXCERPT_RETRY_DELAYS` and `PRONUNCIATION_WORK_ROOT` overrides are deferred to Stage 3 (step 12), once `pronunciation.constants.ts` exists.
- Extended `speech-to-text.spec.ts` with `PronunciationAssessmentService.assessClip`'s two tests (`assesses_a_clip_with_the_callers_key`, `audits_the_callers_feature_label_for_a_clip`), reusing the same 16 kHz WAV fixture F18's shape needs.

**Validation:** typecheck ✅ · lint ✅ · unit 194/194 (17 new) ✅ · integration `speech-to-text.spec.ts` 5/5 ✅ · openapi snapshot fresh (no route change this stage) ✅ · live check against the real Azure endpoint ✅ (latency ~2.5 s for an 8 s clip; scratch script and TTS clip deleted afterward, nothing committed)
**Commit:** _(pending — recorded after Stage 3's commit)_

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
