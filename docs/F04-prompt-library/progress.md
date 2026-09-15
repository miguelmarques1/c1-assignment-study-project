# Implementation Progress: Prompt Library

**Status:** in progress
**Branch:** main
**Started:** 2026-09-15
**Last updated:** 2026-09-15

## Stage 1: Format and Feasibility — ✅ done

- [x] **1. Schema Dialect Spike**
- [x] **2. Envelope Definition and Types**
- [x] **3. The Nine MVP Prompt Files**

**Observations:**
- The spike (throwaway script, deleted after the run) proved the spec's dialect decision live: a hand-built lowercase-type JSON Schema with an `enum` field compiled under Ajv's default strict mode without modification, was accepted by Gemini via `config.responseJsonSchema`, and the live response validated against that same schema object.
- Real finding from the spike, not foreseeable from docs alone: `gemini-2.5-flash` returned a 404 for this BYOK account — "no longer available to new users, use models/gemini-3.6-flash". Queried `ai.models.list()` against the same live key and confirmed `gemini-3.6-flash` is available and working. All nine prompt files use `gemini-3.6-flash`, not the PRD's illustrative `gemini-2.5-pro` string (that was a boot-log example, not a pinned requirement). Model ids are pinned per file (not an alias like `gemini-flash-latest`) because the `model` column exists precisely to make execution reproducible — an alias silently drifting would undermine the PRD's own "compare two prompt versions" use case by confounding it with an unannounced model change.
- Second real finding: `gemini-3.6-flash` is a thinking model. The trivial spike request alone spent `thoughtsTokenCount: 521` against `candidatesTokenCount: 62` — i.e. `usageMetadata.totalTokenCount` is `promptTokenCount + candidatesTokenCount + thoughtsTokenCount`, not just prompt+candidates. This has two downstream consequences recorded for Stage 3: (a) `max_output_tokens` in every prompt file was set with real headroom above the raw text the task needs, since the generation budget on a thinking model covers reasoning too, not just visible output; (b) the execution service will call with `thinkingConfig: { thinkingLevel: 'LOW' }` uniformly (a code-level default, not a YAML field — the interview explicitly said not to extend the envelope beyond the PRD's field list) to keep these fairly mechanical structured-generation/analysis tasks from burning an unpredictable reasoning budget.
- The nine `response_schema` definitions are not invented — each is derived from the specific PRD acceptance criteria for its consuming feature (F06/F11/F14/F15/F17), as traced in spec.md's Component Overview table. `lesson-analysis.yaml`'s `errors[].tag` enum in particular is the exact mechanism F11's "an error tag outside the taxonomy fails schema validation and triggers the library retry" criterion depends on.
- Authoring the nine files by hand demonstrated exactly the failure mode the boot-time example-validation decision exists to catch: `grammar-generate.yaml`'s third example question was first written with only 3 options instead of 4 (caught and fixed by manual review before Stage 2 ran). Had it shipped uncaught, `every_mvp_prompt_id_is_reachable_after_boot` (Stage 2) would have failed the boot with the file and the violated field named — the design intent held up against a real, human-made mistake, not just the deliberately-broken fixtures.

**Validation:** lint ✅ · typecheck ✅ (both re-run as part of Stage 2's combined check, see below)
**Commit:** _(recorded in Stage 2's commit — see below)_

## Stage 2: Boot-Time Loading and Validation — ⬜ pending

- [ ] **4. Single-File Loader**
- [ ] **5. Registry and Boot Wiring**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 3: Rendering and Execution — ⬜ pending

- [ ] **6. Template Rendering**
- [ ] **7. Response Validation**
- [ ] **8. Execution Service**
- [ ] **9. Execution Telemetry**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 4: Integration and Verification — ⬜ pending

- [ ] **10. Error Registry Additions**
- [ ] **11. Module Registration**
- [ ] **12. Full Prompt Verification**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_
