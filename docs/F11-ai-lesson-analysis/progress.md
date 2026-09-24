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
**Commit:** _(recorded after commit below)_

## Stage 2: Analysis prompt — ⬜ pending

- [ ] **6. Prompt v2 and boot check**
- [ ] **7. Live prompt check**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

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
