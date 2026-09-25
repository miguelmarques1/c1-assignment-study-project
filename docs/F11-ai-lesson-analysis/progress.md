# Implementation Progress: AI Lesson Analysis

**Status:** in progress
**Branch:** main
**Started:** 2026-09-24
**Last updated:** 2026-09-24

## Stage 1: Contracts, taxonomy and data model — ✅ done

- [x] **1. Shared contracts**
- [x] **2. Error taxonomy**
- [x] **3. Data model and migration**
- [x] **4. Prompt library and seams**
- [x] **5. PRD alignment**

**Observations:**
- `packages/shared/src/schemas/analysis.ts` is new: `analysisCompetencySchema` (the PRD's five, in order — pronunciation is excluded, since F12 sources it from Azure), `errorSeveritySchema`, `scenarioContextSchema` (`full`/`situation_only`/`none`), the view schemas and `lessonAnalysisViewSchema`. `pipeline.ts` gained `profile_update` and `analysisFailureCodeSchema` (folded into `stageFailureCodeSchema`).
- `apps/api/rules/error-taxonomy.yaml` v1: 3 families (`grammar` 22, `vocab` 8, `discourse` 6 — 36 tags total, all `analysis: true`), loaded and validated at boot the same way F09's excerpt-selection rules are, with a pinned SHA-256 fingerprint (`3485cba6a7…`) in `test/unit/error-taxonomy.spec.ts`. The pronunciation family stays for F12 to add.
- `ErrorTaxonomyService` mirrors `ExcerptRulesService`'s `OnModuleInit` pattern exactly; `TaxonomyModule` exports it for F11 (stage 2+) and later F12/F14/F17.
- `PromptExecutionResult` gained `inputTokens`, `outputTokens` (both `|| null`, matching the telemetry service's own null-when-zero convention) and `latencyMs`, computed from the same accumulators `PromptExecutionService.execute` already tracked for telemetry — no new instrumentation needed.
- `CredentialExecutorService.isAuthenticationFailure` is now exported for F11's own outcome classifier (stage 3) to reuse against Gemini's errors.
- `ProfileTagsPort` moved from `scenario/` to a new `profile/` module (`ProfileModule`), unchanged in behaviour. `ScenarioModule` now imports `ProfileModule` instead of providing the port itself; `role-card.service.ts`'s import path updated. `apps/api/AGENTS.md`'s port example path updated to match. No test referenced the old path directly (only through DI), so no test file needed changes.
- PRD alignment: F11's Error Handling sentences for quota and timeout now read "the stage fails after the third retry" (previously "after the third failure" / "three timeouts fail the stage"), resolving the ambiguity against the 1/5/15-minute, three-delay retry schedule — the same "N retries, N+1 attempts" reading F08 already established.
- Migration `0011_lesson_analysis` is the spec's SQL verbatim: `lesson_analyses` and `lesson_analysis_errors`, widened `ck_stages_stage`/`ck_stages_reason_code`/`ck_branches_stage`/`ck_branches_failure_code`. Applied locally; `schema.prisma` mirrors it with two new models and back-relations on `User`, `Lesson` and `LessonUtterance` (`analysisErrors LessonAnalysisError[]`, since an utterance's quote can in principle be reused across an analysis's errors — no uniqueness constraint was warranted there).
- Regenerated `docs/api/openapi.json` now (not deferred to Stage 4), following F10's own precedent, since the pipeline stage/reason vocabulary already changed and `test/unit/openapi.spec.ts` guards staleness on every run. Hit the same `tsx`/esbuild `emitDecoratorMetadata` silent-crash gotcha F10's Stage 4 recorded (present already, unrelated to this feature's own handler, which doesn't exist yet) — worked around identically: `pnpm --filter @english-quest/api build` then `node dist/openapi/generate.js`. Stage 4 will regenerate again once the analysis route and component exist.

**Validation:** typecheck (shared, api, web) ✅ · lint ✅ · unit 217/217 (9 new: error-taxonomy) ✅ · integration (scenario 13/13, scenario-generation 11/11, prompt-execution-telemetry 6/6, prompt-boot 6/6) ✅ · openapi snapshot fresh (23 operations, no new route yet) ✅
**Commit:** 0cb7d37 "F11 spec/plan and stage 1 - contracts, taxonomy and data model"

## Stage 2: Analysis prompt — ✅ done

- [x] **6. Prompt v2 and boot check**
- [x] **7. Live prompt check**

**Observations:**
- `lesson-analysis.yaml` rewritten as v2: `competencies` is a keyed object (five required competencies, each `{score 0-100, justification}`), `errors[]` unbounded (see live-check finding below), `recurring_tags[]`, `scenario_fit` nullable `{register_matched, register_comment, expressions_attempted}` (no `expressions_missed` — code derives it from the card), `topics_to_practice` 3-6. `max_output_tokens: 8192`. Speaker labels in the template are `YOU` / `OTHER n`, never names or role labels, per the spec's privacy rule.
- `verify-analysis-prompt.ts` compares the prompt's `errors[].tag` and `recurring_tags[]` enums against `ErrorTaxonomyService.current().analysisTags` as sets (order-independent), throwing `AnalysisTaxonomyMismatchError` naming every missing/extra tag. Wired into `main.ts` right after `loadPrompts`. `TaxonomyModule` added to `AppModule` (needed for `app.get(ErrorTaxonomyService)`).
- **Live-check finding (step 7), a significant and non-obvious deviation from the spec's assumed schema:** Gemini's `responseJsonSchema` rejects (`400 INVALID_ARGUMENT`, no further detail in the error body) any array schema that combines `maxItems` with an item schema whose `enum` contains strings mixing both `:` and `-` — exactly the taxonomy's own `family:kebab-slug` tag format. Isolated by bisection against the live API (not assumed): a colon-only enum or a hyphen-only enum under `maxItems` is accepted; only the combination is refused, and only when `maxItems` is present (`minItems` alone is fine, no bound at all is fine). This is invisible from documentation and from Ajv's own compile step, since the schema is perfectly valid JSON Schema — it is Gemini's own schema-to-tool-config translation that trips on it. Removed `maxItems: 25` from `errors[]` in the prompt file; the 25-item cap moves to code (stage 3's output rules truncate before quote-matching) rather than the schema. Documented as a deviation in spec.md's Assumptions table, right after the schema-shape row it revises.
- Restarted the real dev server in the `api` container (the stale `tsc --watch` process had gotten stuck on the deleted `scenario/profile-tags.port.ts` with a `TS6053` file-not-found loop that outlasted several file-change cycles even with polling on, so a fresh process was needed rather than waiting on it) — booted clean end to end against the real Postgres/Redis/MinIO/LiveKit stack, logged `Loaded prompt lesson-analysis v2` and `Loaded error taxonomy v1 (3485cba6a7ea), 36 tags, 36 scored by lesson analysis`, no `AnalysisTaxonomyMismatchError`, `Nest application successfully started`. Confirmed `GET /health` responds. This is the real boot-check exercise the runtime-surface completion rule asks for, not just a unit test.
- Live prompt check ran three scenarios (full scenario, no scenario, truncated transcript) against the real Gemini API with the user's own `TEST_GEMINI_API_KEY`, through a throwaway script (never committed, deleted immediately after): all three validated against the (fixed) schema on the first attempt; `no_scenario` correctly returned `scenario_fit: null` with no invented scenario; the full-scenario and truncated cases returned a populated fit block with expressions drawn from the given card. Estimated tokens (chars/4) tracked the real reported input tokens within about 4% (1349 estimated vs. 1403 reported on the largest message), supporting the chars/4 local-estimate assumption. Latency ~4.2-4.8 s per call.

**Validation:** typecheck ✅ · lint ✅ · unit 219/219 (2 new: `the_prompt_enum_matches_the_analysis_tags`, `boot_check_names_missing_and_extra_tags`) ✅ · integration `prompt-boot.spec.ts` 6/6 (re-run with prompt v2) ✅ · openapi snapshot fresh (no route/component change this stage) ✅ · real dev-server boot against the live stack ✅ · live Gemini check (3/3 scenarios, schema valid, `scenario_fit` correctly null/populated) ✅
**Commit:** f0adb28 "F11 stage 2 - analysis prompt"

## Stage 3: Analysis stage — ✅ done

- [x] **8. Transcript rendering and budget**
- [x] **9. Input builder**
- [x] **10. Output rules and classification**
- [x] **11. Result writer and reader**
- [x] **12. Stage handler and pipeline order**
- [x] **13. Adapting earlier suites**

**Observations:**
- `analysis-transcript.ts` (pure): `renderTranscriptLines` labels `YOU`/`OTHER n` by first-appearance order and formats `[mm:ss]` (minutes unbounded, e.g. `[95:12]`); `fitToBudget` drops the other participants' oldest lines first, then the owner's own, and builds the truncation note. `othersOmittedBeforeMs`/`ownOmittedBeforeMs` fall back to "one past the last dropped instant" when every line of that group was dropped (documented in code) — a minor edge case, not tested against a specific value beyond the note still reading sensibly.
- `analysis-input.builder.ts` reuses F08's `mergeTranscript` directly for the merged, chronological, correctly-shifted turns (no reimplementation), reads the scenario/card only for `full`/`situation_only` contexts, and treats a missing `PronunciationResultReader` result as unreachable (throws a plain `Error`, letting the runner's own generic retry-then-`internal_error` path handle it — F10 always writes a result, even `no_sample`, before completing).
- `analysis-output.ts` (pure): quote matching normalizes (NFKC, case, curly quotes/dashes, punctuation except apostrophes) and tries a single utterance then a consecutive pair; ellipsis (`...`/`…`) splits into ordered fragments. The 25-error cap (moved to code per Stage 2's live-check finding) is applied before matching. `expressionsUsed`/`expressionsNotUsed` are built from the **card's own array**, filtered by what the model attempted, so the two always partition the card exactly regardless of what the model returns.
- `analysis-outcome.ts` (pure): mirrors F08's transcription classifier — `CRED002`/`CRED003` block, an auth-failure (401/403/`API_KEY_INVALID`, already marked invalid by the vault) blocks as rejected, `PROMPT_TIMEOUT`/`PROMPT_EMPTY_RESPONSE`/5xx/network retry, `PROMPT_EXECUTION_FAILED` and any other 4xx fail at once. Anything it doesn't recognize is left to propagate to the runner's own unclassified-retry path.
- **A real, non-obvious bug found only by the integration suite, not by unit tests or typecheck:** `AnalysisResultWriter` wrote `Prisma.JsonNull` for an absent `scenario_fit`/`truncation`, which stores the **JSON** value `null` inside the jsonb column — not a SQL `NULL`. `ck_lesson_analyses_fit` and `ck_lesson_analyses_truncation` both test `IS NULL`, which is false for a column holding `'null'::jsonb`, so **every successful completion outside `scenario_context = 'full'` with an untruncated transcript violated a check constraint** and the stage failed instead of completing. Found via the Postgres error surfacing through `pipeline.processor.ts`'s "Unclassified failure" log (4 retries, each hitting the same constraint) once a diagnostic log was added temporarily to the handler's `classify()` to see what was actually being thrown. Fixed by using `Prisma.DbNull` (the actual SQL NULL) instead of `Prisma.JsonNull` for both fields. This is the sharp edge the project's own convention note ("Prisma JSON null is `Prisma.JsonNull`, not `null`") doesn't cover: that rule is for *storing* a JSON null value on purpose, not for representing the column's *absence*, which needs `Prisma.DbNull`. Worth flagging for any future nullable `Json?` column in this codebase.
- **A second real bug, purely a test-timing artifact, not a product bug:** the very first full-suite run (5 adapted F08/F09/F10 files) failed everywhere with "last: retrying" instead of "blocked_missing_key". Root cause: that background run was started *before* `pipeline-fixtures.ts`'s `createPipelineTestContext` was finished being edited to load the prompt registry — Node/Vitest had already cached the pre-edit module for that run, so `PromptRegistryService.get('lesson-analysis')` threw `PromptRegistryNotLoadedError` (a plain, unclassified error → retryable → eventual `internal_error`), independent of any real credential logic. Re-running the exact same suites fresh (no files edited mid-flight) passed cleanly on the first try. No code change was needed for this one; recorded here as a warning against editing a shared test fixture while a suite that imports it is still running in the background.
- **Adapting F08/F09/F10's suites (step 13), the pattern predicted in Stage 2's notes confirmed exactly:** every fixture user in `excerpt-selection-pipeline.spec.ts`, `pipeline-routes.spec.ts`, `transcript-routes.spec.ts`, `transcription-pipeline.spec.ts` and `pronunciation-pipeline.spec.ts` that previously rested at `lesson_analysis` / `queued` (no handler) now races to `lesson_analysis` / `blocked_missing_key` / `credential_missing` within the same tick the stage is queued, since none of these fixtures ever stored a Gemini key. Every affected assertion now `waitForStage(..., 'lesson_analysis', ['blocked_missing_key'])` before reading the branch, instead of reading it immediately after the *previous* stage completes. `pipeline-drain.spec.ts`'s `ignores_stages_without_a_registered_handler` test — whose whole premise was "`lesson_analysis` has no handler yet" — was rewritten against `profile_update` instead (F11's own next stage, appended one feature early, with no handler yet), which preserves the exact scenario the test exists to cover.
- **A second, unrelated flaky test surfaced and fixed:** `pronunciation-pipeline.spec.ts`'s `temporary_clips_are_deleted` intermittently found a leftover `f10-XXXXXX` temp directory. Root cause: F10's stage row flips to `completed` inside `context.complete`'s transaction one step *before* the handler's `finally` removes its temp directory — a pre-existing, harmless gap that `waitForStage` alone can race past. Completing `pronunciation_assessment` now also auto-enqueues `lesson_analysis` (F11's handler is registered), which added enough concurrent work on the same worker pool to make the gap observable where it previously wasn't. Fixed at the test level with a small `waitForEmptyDir` poll (mirroring the codebase's existing `waitFor`/`waitForStage` convergence pattern) rather than touching F10's production code, since the directory *is* always eventually removed — confirmed by re-running the full file clean afterward. Not a regression in F10's behaviour, just a race the added pipeline activity made visible.
- `pipeline-fixtures.ts` gained: `PromptRegistryService.loadAll(...)` inside `createPipelineTestContext` (every pipeline suite now loads the real prompts); `seedSpeaker`'s `withGeminiKey`/`geminiStatus` options and `storeGeminiKey` (mirroring `storeAzureKey`); `FAST_ANALYSIS_RETRY_POLICY` folded into the default `PIPELINE_RETRY_OVERRIDES`; `startAnalysis`; and `makeAnalysisReadyLesson` — F11's own direct-construction fixture (transcript, an empty `lesson_excerpt_selections` row, a `lesson_pronunciation_results` row, and a branch resting at `lesson_analysis`/`queued`), the same bypass-the-upstream-pipeline idiom `makeTranscribedLesson` established for F07/F08.
- `fake-gemini.ts` gained an `'analysis'` call kind (detected by `competencies` in the response schema), a per-key scripted-step queue (`scriptAnalysis`, mirroring `fake-speech.ts`'s `script()`), and `fakeAnalysis()` — a default generator that quotes the first real `YOU` line verbatim (so quote-matching succeeds without a test having to script one) and only includes `scenario_fit` when the rendered `scenario_status` says a full scenario (situation *and* card) was given.
- `apps/api/src/analysis/analysis.service.ts` and `analysis.controller.ts` were written now (originally Stage 4 work) since they were quick once the reader existed; they are not yet wired into `analysis.module.ts` or the OpenAPI document — that wiring is Stage 4's own step, done after this stage's validation to avoid touching the app's module graph while integration suites were still running against it.
- `PIPELINE_STAGE_ORDER` now ends `…, lesson_analysis, profile_update`, one feature early per the established pattern — no handler is registered for `profile_update` yet, so a branch reaching it just waits, like `lesson_analysis` did before this stage.

**Validation:** typecheck (api, web) ✅ · lint ✅ · unit 256/256 (36 new: 8 analysis-transcript, 19 analysis-output, 9 analysis-outcome) ✅ · integration, fresh full runs: `excerpt-selection-pipeline` 14/14 ✅, `pipeline-drain` 8/8 ✅ (renamed 1 test), `pipeline-routes` 12/12 ✅, `transcript-routes` 11/11 ✅, `transcription-pipeline` 15/15 ✅, `pronunciation-pipeline` 22/22 ✅ (1 flaky test fixed), `analysis-pipeline` (new) 17/17 ✅
**Commit:** _(recorded after commit below)_

## Stage 4: Route and document — ⬜ pending

- [ ] **14. Analysis route**
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
