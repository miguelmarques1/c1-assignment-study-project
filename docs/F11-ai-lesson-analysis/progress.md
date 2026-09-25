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
**Commit:** _(recorded after commit below)_

## Stage 3: Analysis stage — ⬜ pending

- [ ] **8. Transcript rendering and budget**
- [ ] **9. Input builder**
- [ ] **10. Output rules and classification**
- [ ] **11. Result writer and reader**
- [ ] **12. Stage handler and pipeline order**
- [ ] **13. Adapting earlier suites**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

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
