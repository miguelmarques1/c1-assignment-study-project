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
**Commit:** dca75d1 - F04 stage 1 - prompt format and the nine MVP prompts

## Stage 2: Boot-Time Loading and Validation — ✅ done

- [x] **4. Single-File Loader**
- [x] **5. Registry and Boot Wiring**

**Observations:**
- `PromptRegistryService.get()` needs `AppError.promptNotFound` (PROMPT002), which the plan's Stage 4 Step 10 ("Error Registry Additions") wasn't scheduled to exist until later. Deviation: added all four PROMPT00x codes to `packages/shared/src/errors/codes.ts` and their `AppError` factory methods now, in Stage 2, since the registry has a real compile-time dependency on them. Stage 4's Step 10 is therefore already satisfied — its commit will note "already done, see Stage 2" rather than re-touching the file.
- `PromptRegistryNotLoadedError` (querying the registry before `loadAll()` ran) is deliberately a different error class from `AppError.promptNotFound` (querying an id that doesn't exist after loading) — conflating them would make a boot-ordering bug read as a missing prompt, pointing whoever debugs it at the wrong file.
- Ran the real nine-file directory (not just fixtures) through the loader via an integration test — `every_mvp_prompt_id_is_reachable_after_boot` — which is what actually caught the grammar-generate.yaml 3-option example bug during authoring (see Stage 1 observations); by the time this stage's tests were written the bug was already fixed, so all nine pass clean.
- Restarted the real API dev process in the running Docker stack and read the boot log directly: all nine "Loaded prompt … (model gemini-3.6-flash, schema OK)" lines appear, followed by "Prompt library: 9 prompts loaded", with no change to existing routes or the credential-vault boot line. `/health` returns 200 afterward — confirmed with `curl`, not just log-reading.

**Validation:** lint ✅ (new + touched files) · typecheck ✅ · tests 15/15 ✅ (9 `prompt-file-loader.spec.ts` + 6 `prompt-boot.spec.ts`) · boot smoke test ✅ (real Docker stack, real log output, real `/health` 200)
**Commit:** _(pending)_

## Stage 2: Boot-Time Loading and Validation — ⬜ pending

- [ ] **4. Single-File Loader**
- [ ] **5. Registry and Boot Wiring**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 3: Rendering and Execution — ✅ done

- [x] **6. Template Rendering**
- [x] **7. Response Validation**
- [x] **8. Execution Service**
- [x] **9. Execution Telemetry**

**Observations:**
- Real bug caught by `response-validator.spec.ts::invalid_response_reports_every_violated_field`: Ajv's default `allErrors` is `false` — it stops at the first violation. Without `{ allErrors: true }`, a response failing on 3 fields would only ever report 1 in the retry's correction instruction, so the model corrects one field, fails again on the next, and only converges after several retries the library doesn't grant. Fixed in both `response-validator.ts` and `prompt-file-loader.ts` (the latter for complete example-validation error messages too).
- The one schema retry is a fresh single-turn call (same rendered message + appended errors), never a replay of the invalid response as conversation history — matches the spec's decision and keeps `callModel`'s shape identical for both attempts.
- A response whose `text` parses to JSON but fails Ajv validation, and a response whose `text` is present but is not valid JSON at all, are both routed through the exact same one-retry path (a synthetic `['response was not valid JSON']` error list stands in for Ajv's `errors` in the latter case) — treating "didn't produce parseable JSON" as a case of "didn't follow the schema contract" avoided inventing a seventh outcome category for what is functionally the same failure.
- Timeout detection deliberately avoids two fragile alternatives (string-matching an arbitrary message from a shared helper not designed for this call site, and an elapsed-time heuristic that would misfire on a slow-but-real retried pair of responses summing past 90s). Instead `callModel` catches `withTimeout`'s rejection immediately, at the one call site that knows a 90000ms race is in flight, and translates it to a distinguishable internal signal there.
- `withKey` blocking before the callback runs (missing/invalid credential) writes **no** `prompt_execution` row — nothing prompt-related was attempted, and `withKey` already wrote its own `credential_usage` audit row for the block. An `attempted` flag distinguishes this from every other failure path, which does record telemetry. Covered by `propagates_credential_errors_without_recording_telemetry`.
- Output-token accounting includes `thoughtsTokenCount` (see Stage 1's spike finding) — `sums_token_counts_across_both_attempts` pins `outputTokens = candidates1+thoughts1+candidates2+thoughts2`, not just the candidates half, since thinking tokens are billed the same as visible output.
- `PromptExecution` migration (`0003_prompt_execution`) was **not** taken as-generated from `prisma migrate dev --create-only`: the shadow-DB diff also proposed dropping and recreating the `user_credentials`/`credential_usage` foreign keys with an added `ON UPDATE CASCADE` and two unrelated `ALTER TABLE ... ALTER COLUMN updated_at DROP DEFAULT` statements — pre-existing drift between the schema and migration history that predates F04. Discarded the generated file and hand-wrote the migration to touch only `prompt_execution`, matching this repo's inline-CONSTRAINT style from `0002_credentials`. Worth a note for whoever eventually investigates the `updated_at` drift, but out of scope here.
- Verified against the **live** stack end-to-end via a throwaway script (deleted after the run, not part of the shipped feature): boot-loaded the real `apps/api/prompts`, resolved `you@example.com`'s real stored Gemini key through the real `CredentialExecutorService`, called the real Gemini API for `scenario-situation`, got a schema-valid response on the first attempt (`retried: false`), and confirmed a real `prompt_execution` row (`inputTokens: 382, outputTokens: 226, latencyMs: 2795, outcome: "ok"`). This is the first real proof the whole pipeline — not just the mocked unit tests — produces a usable result.
- Regenerated `docs/api/openapi.json` per the project's standing OpenAPI directive: F04 adds no HTTP routes, but it does add four values to the shared `ErrorCode` enum, which the committed snapshot embeds. Diff confirmed to touch only that enum (10 operations unchanged).
- Discovered mid-stage: the API container has its own `node_modules` volume separate from the host, so `prisma generate` has to be run **both** on host (for host-side typecheck/tests) **and** inside the container (for the live smoke test) — the container's stale client was missing the `promptExecution` model on the first smoke-test attempt.

**Validation:** lint ✅ (0 warnings) · typecheck ✅ · tests 27/27 new (7 renderer + 4 validator + 10 execution service + 6 telemetry) · full `apps/api` suite 156/156 ✅ (the OpenAPI drift guard failed once for the expected reason — new error codes not yet in the committed snapshot — resolved by regenerating it, not a real bug) · live smoke test ✅ against the real Gemini API and real Postgres
**Commit:** _(pending)_

## Stage 4: Integration and Verification — ⬜ pending

- [ ] **10. Error Registry Additions**
- [ ] **11. Module Registration**
- [ ] **12. Full Prompt Verification**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_
