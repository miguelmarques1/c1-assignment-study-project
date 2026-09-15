# Implementation Progress: Prompt Library

**Status:** success
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

## Stage 4: Integration and Verification — ✅ done

- [x] **10. Error Registry Additions** — already done in Stage 2 (registry's `get()` had a real dependency on `PROMPT002`); nothing left to do here.
- [x] **11. Module Registration** — already done: `PromptsModule` has registered/exported the registry since Stage 2 and gained the execution + telemetry services in Stage 3; `AppModule` has imported it since Stage 2.
- [x] **12. Full Prompt Verification**

**Observations:**
- Ran all nine MVP prompts once each against the real Gemini API (throwaway script, deleted after the run) with representative variables per prompt. All nine succeeded on the **first** attempt — `retried: false` across the board, zero schema failures. Confirmed via `psql` that all nine `prompt_execution` rows landed with outcome `ok` and plausible token/latency figures (e.g. `reading-generate`: 534 in / 1006 out / 7.7s; `scenario-situation`: 382 in / 166 out / 2.9s).
- This is the strongest evidence the feature works: every one of the nine hand-authored `response_schema` definitions — each derived from a different consuming feature's PRD acceptance criteria — is simultaneously valid JSON Schema, accepted by Gemini's `responseJsonSchema` config, and actually satisfied by the model's real output, on the first try, for every prompt in the MVP set.
- No further code changes were needed in this stage — it was verification only, so there is nothing new to commit beyond this progress log update.

**Validation:** live verification ✅ — 9/9 prompts, 0 retries, 0 hard failures, real telemetry rows confirmed in Postgres
**Commit:** _(this stage produced no code changes; see Final Verification below for the closing commit)_

## Final verification

**6.1 — Full-suite validation (whole repo, not just touched files):**
- `pnpm lint` (repo-wide eslint across apps/api, apps/web, packages/shared, packages/design-tokens) — ✅ 0 errors, 0 warnings
- `pnpm typecheck` (`pnpm -r typecheck`) — ✅ all 4 workspaces clean
- `pnpm test` (`pnpm -r test`) — ✅ 249/249 total: apps/api 156/156, apps/web 76/76, packages/design-tokens 17/17, packages/shared 0/0 (no test files). Zero failures, zero regressions. Some intentionally-noisy stderr output appears mid-run (a deliberately-invalid Azure region, a scrubbed fake connection string, a forced "db is down") — these are existing tests exercising error paths on purpose, not real failures; every one of them is marked ✓.

**6.2 — Component Overview walk-through:** every file listed in spec.md's Component Overview exists with its described role:
- All 9 prompt YAMLs under `apps/api/prompts/` ✓
- All 9 files under `apps/api/src/prompts/` (`prompt-types.ts`, `prompt-envelope.schema.ts`, `prompt-file-loader.ts`, `prompt-registry.service.ts`, `template-renderer.ts`, `response-validator.ts`, `prompt-execution.service.ts`, `prompt-execution-telemetry.service.ts`, `prompts.module.ts`) ✓
- `apps/api/src/boot/load-prompts.ts` ✓
- `apps/api/prisma/migrations/0003_prompt_execution/migration.sql` ✓ (renumbered from the spec's first-draft `0004` to the actually-correct next-free number, `0003`, during the spec review — the shipped migration matches the corrected spec)
- `main.ts`, `app.module.ts`, `packages/shared/src/errors/codes.ts`, `apps/api/package.json` modified as described ✓
- Nothing missing.

**6.3 — AC re-check** (PRD Section 9, F04 — tests re-run fresh in 6.1, not just trusted from earlier phases):

| PRD criterion | Test | Result |
|---|---|---|
| All nine MVP prompts load at boot with one log line each naming id, version, model and schema status | `prompt-boot.spec.ts::loads_all_nine_mvp_prompts_with_one_log_line_each` | ✓ pass |
| A malformed YAML file, a missing required field or an invalid `response_schema` prevents API startup with the file and path named | `prompt-boot.spec.ts::refuses_to_start_on_any_malformed_file`, `prompt-file-loader.spec.ts::rejects_a_missing_required_field`, `::rejects_an_invalid_response_schema` | ✓ pass |
| Rendering fails loudly when a required variable is absent or empty | `template-renderer.spec.ts::throws_when_a_required_variable_is_absent_or_empty` | ✓ pass |
| Model output violating `response_schema` triggers exactly one retry with the validation errors appended | `prompt-execution.service.spec.ts::retries_once_and_recovers` | ✓ pass |
| A second schema violation raises a hard error to the caller and retains the raw response | `prompt-execution.service.spec.ts::hard_fails_after_a_second_invalid_response`, `prompt-execution-telemetry.spec.ts::records_raw_response_only_on_hard_error` | ✓ pass |
| Every execution records prompt id, version, model, token counts, latency and outcome | `prompt-execution-telemetry.spec.ts::records_token_counts_and_latency` | ✓ pass |
| Every artifact produced by a prompt stores that prompt's id and version | `prompt-execution.service.spec.ts::stamps_the_returned_prompt_version_from_the_registry_at_call_time` | ✓ pass for F04's half of the contract (the value is correct and returned); persisting it onto F06/F11/F14/F15/F17's own artifacts is those features' job, not testable here since none of them exist yet |

**Cross-feature integration:** the PRD's criterion ("Prompt execution through the library (F04) stamps its prompt id and version onto the scenario artifacts (F06), the analysis (F11), generated items (F14), plan composition (F15) and writing corrections (F17)") is satisfied on F04's side — proven above — but its consumer half cannot be exercised until those features exist. Not a gap in F04; recorded here so it isn't mistaken for one later.

**6.4 — Environment smoke check:** all runtime surfaces were exercised for real, not just mocked:
- Boot: real Docker stack restarted, real log output showed all nine "Loaded prompt …" lines plus "Prompt library: 9 prompts loaded", `/health` returned 200 afterward.
- Execution: a throwaway script (deleted after each run) called `PromptExecutionService.execute()` against the real Gemini API through the real BYOK-stored key for `you@example.com`, for **all nine** MVP prompts, with representative variables. All nine succeeded on the first attempt (`retried: false`), and all nine real `prompt_execution` rows were confirmed via `psql` with plausible token counts and latencies.
- No smoke check was skipped or soft-failed — Docker was available throughout this run, unlike earlier features in this project's history.

**6.5 — Status decision:** `success`. Full suite green, every Component Overview item present, every AC's test passes on this fresh re-check, every smoke check passed for real (none needed to soft-fail).

**Follow-up work (not gaps in F04, but the natural next steps once later features exist):**
- F06, F11, F14, F15 and F17 each need to call `PromptExecutionService.execute()` and persist `promptId`/`promptVersion` on their own artifacts — F04 only guarantees the value is correct and available.
- The pre-existing `updated_at` DEFAULT drift between `schema.prisma` and the `0001`/`0002` migration history (surfaced by `prisma migrate dev --create-only`'s shadow-DB diff while building this feature, described in Stage 3's observations) is unrelated to F04 and was deliberately left untouched — worth a look whenever someone next touches those tables.
- Wording quality of the nine prompts' `system`/`user_template` content is expected to be refined by whichever feature actually consumes each one; F04 only guarantees structural correctness (schema-valid, boot-valid, and proven against the live model once).
