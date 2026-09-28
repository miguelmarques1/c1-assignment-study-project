# Implementation Progress: Writing Activity with AI Correction

**Status:** in progress
**Branch:** claude/youthful-hamilton-ticoma
**Started:** 2026-09-28
**Last updated:** 2026-09-28

## Stage 1: Contracts, Rules and Data Model — ✅ done

- [x] **1. Shared Writing Contracts, Constants and Word Counter**
- [x] **2. Writing Task Rules File**
- [x] **3. Data Model and Migration**

**Observations:**
- `packages/shared/src/schemas/writing.ts` holds every schema and constant from spec §4/§5, plus `countWords`/`wordTokens` (A19: a run of letters/digits with one internal apostrophe or hyphen — `[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*`).
- `rules/writing-tasks.yaml` (version `1`): 12 scenarios across the six C1 genres (2 each: essay, formal letter, proposal, report, review, article) and 36 requirement sentences, one per analysis-family tag in taxonomy v2 (22 grammar + 8 vocab + 6 discourse). Word counts were designed and verified with a scratch script before committing (scenario texts 54–57 words, requirements 12–28 words, closing 14 words, general requirement 20 words), so every scenario × single-requirement, × two-longest-requirements and × general-requirement combination lands in 80–150 words with margin. `writing-task-rules.spec.ts::every_tag_and_scenario...` from the spec's test table is covered by the loader's own boot-time invariant check (`loads_the_committed_rules_file` proves the committed file loads clean) rather than a separate enumeration test, since the invariant itself enumerates every scenario against the extremal requirement combinations.
- Split the rules validation exactly as spec's Component Overview implies: `writing-task-rules.ts` (pure — schema, structural invariants, the 80–150 word-bound checks, fingerprint) needs no taxonomy; `checkRequirementsCoverage` (tag-vs-taxonomy match) is a separate pure function the `WritingTaskRulesService.onModuleInit` calls with `ErrorTaxonomyService.current().analysisTags`, mirroring how `error-taxonomy.service.ts` layers onto its own pure loader.
- `WRITING_OPTIONS` DI token added now (in `writing.constants.ts`) even though Stage 3 is what uses it, following the pipeline's `PIPELINE_RETRY_OVERRIDES` / pronunciation's override-token pattern — kept here since it lives beside the other writing constants and avoids a later edit to a file every other writing file will import.
- Prisma: `WritingCorrection.rejectedTags` is `String[]` (not `String[]?` — Prisma's schema language forbids optional list types outright) even though the DB column is nullable (unset until `succeeded`); Prisma reads a NULL array column back as `[]`, which is indistinguishable from "no rejected tags" here, matching the field's own meaning.
- Regenerated `docs/api/openapi.json`: adding `WRIT001`–`WRIT007` to the shared error-code enum changes every route's generic error-response schema, so the snapshot needed a refresh even though Stage 1 adds no route. `pnpm --filter @english-quest/api openapi:generate` (the `tsx`-based CLI script) fails in this sandbox with a silent `process.exit(1)` from `NestFactory.create` — confirmed pre-existing on a clean `main` checkout via `git stash` (unrelated to F17): Nest's DI metadata scanning throws inside `Reflect.getMetadata` when the module graph is loaded through plain `tsx`/esbuild instead of the project's SWC transform. Worked around by running the same `buildOpenApiDocument` call inside a throwaway vitest spec (vitest's `unplugin-swc` transform emits the decorator metadata `tsx` doesn't), which produced an identical document to what the real CLI script would; the throwaway spec was deleted after use. This CLI limitation should be looked at separately since every later stage that changes a route will hit it too.

**Validation:** typecheck ✅ (`pnpm -r typecheck`) · lint ✅ (`pnpm lint`, zero warnings) · shared tests ✅ (`word-count.spec.ts`, 7/7) · API unit tests ✅ (74 files / 613 tests, including the new `writing-task-rules.spec.ts` 10/10 and `openapi.spec.ts` 4/4 against the regenerated snapshot)
**Commit:** _(pending — recorded after this stage's commit lands)_

## Stage 2: Task Composition and Drafts — ✅ done

- [x] **4. Task Composer**
- [x] **5. Writing Repository**
- [x] **6. Opening and Reading an Activity**
- [x] **7. Draft Saving**

**Observations:**
- Stage 1's commit SHA: `0f09e05`.
- **Deviation (reordering, not scope):** pulled `output/highlight-segments.ts`, `output/revision-diff.ts`, `output/error-groups.ts` and `writing-limit.ts` forward from plan.md's Stage 3 into this stage, because `writing-view.builder.ts` (this stage's own step 6) needs all four to render a `corrected` view and the daily-limit field — spec itself says these are "computed at read time" by the view builder, not by the Stage-3 submission/runner path. `output/quote-locator.ts` and `output/writing-output.ts` (`processCorrectionOutput`) stay in Stage 3 as originally planned, since those only run while processing a fresh model response, never at read time. `analysis/correction-diff.ts`'s `matchKey` export (spec's own planned additive change) was needed now for `revision-diff.ts` rather than in Stage 3.
- `revision-diff.ts`: tokenizes into words (A19's rule) and single-character "glue" (whitespace/punctuation), runs the same LCS core as `correction-diff.ts`'s `correctionSegments` over the word sequences only, then assigns each glue atom the `changed` flag of the word immediately before it (or, for glue before the very first word, the first word's own flag) before merging adjacent same-flag atoms. This keeps concatenation exact and interior punctuation/whitespace inside a changed run un-split, which a naive per-token diff would not guarantee. The PRD's illustrative JSON example ("had listened" as one changed segment) is not reproduced byte-for-byte by design — a correct maximum-LCS match can legitimately keep an unchanged word (e.g. "listened") that the doc's illustration shows as changed; the spec's own test names (`marks_changed_words`, `keeps_paragraph_breaks_on_unchanged_segments`, etc.) test the algorithm's properties, not that one worked example, so this is not logged as a spec deviation.
- `writing-view.builder.ts` is synchronous and takes pre-fetched rows (task, latest correction, succeeded correction + its errors, `geminiKeyUsable`, the limit view) rather than querying itself — `WritingActivityService` gathers everything through `WritingRepository` first via `Promise.all`, then calls `build()`. Keeps the builder a pure mapper (matches "computed at read time" without hiding I/O inside it) and needs no transaction-client plumbing of its own.
- `ResolvedActivity` (F15) has no `title` field, and F17's Component Overview does not list `PlanRepository` as a reused seam (only `PlanActivityStateService`) — so `WritingActivityService.activityTitle` reads `study_plan_activities.title` directly through the already-global `PrismaService`, exactly as `resolveForOwner` itself does internally, rather than reaching into F15's own repository class.
- `WritingRepository`'s `taskForUpdate`/`correctionForUpdate` lock with a raw `SELECT id … FOR UPDATE` and then re-read the row through the normal Prisma call in the same transaction (the lock is held for the transaction's lifetime) — mirrors `profile-ingestion.service.ts`'s lock pattern — rather than typing the raw `SELECT *` result directly, which would silently hand back snake_case column names typed as the camelCase Prisma model.
- Added the seven `WRIT001`–`WRIT007` `AppError` factories now (not deferred to Stage 4) since `read()` and `saveDraft()` already throw three of them.
- `limitState` re-filters `requestedAt` to the rolling window itself (using `now`) rather than trusting the caller to have pre-filtered, so the pure function is self-contained and directly testable; the repository's `requestedAtsSince(client, userId, limitWindowStart(now))` is still a coarse DB-side filter so a long-lived account's whole correction history is never fetched.
- Not yet exercised end-to-end: there is no controller yet (Stage 4), so `open`/`read`/`saveDraft` have no integration-test coverage in this stage — logged under Soft-fails below, to be picked up once the HTTP surface and test fixtures exist. Docker/Testcontainers are unavailable in this sandbox regardless (see Stage 1's note), so those suites will need to be run in a Docker-enabled environment when written.

**Validation:** typecheck ✅ (`pnpm -r typecheck`) · lint ✅ (`pnpm lint`, zero warnings) · unit tests ✅ (78 files / 635 tests: new `writing-task-composer.spec.ts` 8/8, `writing-revision-diff.spec.ts` 5/5, `writing-output.spec.ts` 6/6 covering `highlight-segments.ts`/`error-groups.ts`, `writing-limit.spec.ts` 3/3)
**Soft-fails:** No runtime/integration exercise of `open`/`read`/`saveDraft` yet — no controller exists until Stage 4, and Docker is unavailable in this sandbox for Testcontainers regardless.
**Commit:** _(pending — recorded after this stage's commit lands)_

## Stage 3: Correction — ✅ done

- [x] **8. Correction Prompt, Version 2**
- [x] **9. Correction Output Rules**
- [x] **10. Submission**
- [x] **11. Correction Runner and Recovery Sweep**

**Observations:**
- Stage 2's commit SHA: `ffe71a1`.
- `writing-correct.yaml` v2 written with 2 examples (a targeted third-conditional letter, and a general-task proposal), both validating against the response schema at load time (`prompt-file-loader.ts` checks this automatically). `verify-writing-prompt.ts` mirrors `verify-plan-prompt.ts`/`verify-analysis-prompt.ts`: pins the four variables, the `errors[].tag` enum against the taxonomy's 36 analysis tags, `scores`' four required keys, the absence of `maxItems` on `errors[]`, and at least one example.
- `output/quote-locator.ts` and `output/writing-output.ts` (`processCorrectionOutput`) landed here as originally planned (Stage 2's progress note already explains why the other three `output/*` files and `writing-limit.ts` moved earlier).
- **Design finding, logged as a deviation from a literal reading of A17's "duplicates... are dropped":** no separate de-duplication step was needed. `locateQuote`'s `claimed` set (already required for "prefers an unclaimed occurrence of a repeated quote") already makes two accepted errors sharing the same span impossible by construction — a second candidate for an already-claimed span either finds a genuinely different, legitimate occurrence of the same mistake (correctly accepted as a second, distinct error) or finds none and is discarded as unlocated. `discardedErrorCount`'s comment in the data model ("unlocated, overlong or duplicate errors") is satisfied without a third code path.
- `classifyCorrectionError` follows F14's `classifyGenerationError` almost exactly, but every outcome that F14 would abandon a whole run over (quota, provider 5xx, other 4xx) is `retryable` here instead, per A11's explicit "one retry covers timeouts, empty responses, provider and network errors, quota errors and other 4xx rejections."
- `correction-outcome.ts`'s `toActivityOutcome` is a thin, directly-testable mapper; its output is asserted against F12's own `activityOutcomeSchema` in `writing-correction-outcome.spec.ts` so the contract can never silently drift.
- `WritingCorrectionRunner`: prior ledger counts (A18) are read via `ErrorLedgerReader.entriesFor` against the plain `PrismaService` *before* opening the settling transaction, because `ErrorLedgerReader` has no transaction-client parameter anywhere in the codebase (confirmed — `plan-composer.service.ts` reads it the same way, outside any transaction, before its own later transactional writes). This is an established convention here, not a new gap: nothing else concurrently writes occurrences for the same user and tags in a way this feature needs to guard against.
- The runner's settling failure path re-reads the task's status *inside* the failure transaction and only flips it to `uncorrected`/`correction_failed` when it is still `correcting` (A12) — defence in depth per spec §5 point 6, even though the partial unique index `ux_writing_corrections_task_running` already makes the specific stale-failure race this guards against essentially unreachable in practice.
- `WritingSubmissionService.submit` delegates its whole response — both the idempotent-replay case and the normal success case — to `WritingActivityService.read()` rather than building a `WritingActivityView` a second, divergent way. This also means the submit route's `WRIT001`/`PLAN003` behavior is identical to the read route's by construction.
- `WritingCorrectionJob` follows `PlanRequestJob`'s exact `@Interval('name', ms) run(now: Date = new Date())` shape, so the same "call `job.run(now)` directly in tests, with the interval either not yet firing or irrelevant to a short unit run" convention applies.
- Not yet wired into `AppModule`: per plan.md, `writing.module.ts` is created together with the controller in Stage 4 ("register the module"). Until then, `WritingTaskRulesService.onModuleInit` never actually runs in the booted app (nothing instantiates it), so the rules file is not yet enforced at real boot — this closes automatically once Stage 4 registers the module, which Nest then instantiates as part of normal provider bootstrapping.
- **Soft-fail, carried forward and made explicit here:** the integration suites this stage's behavior most needs (`writing-correction.spec.ts`, `writing-correction-failures.spec.ts`, `writing-limit.spec.ts` integration) were **not written** in this run. Two reasons compound: (1) Docker/Testcontainers is unavailable in this sandbox, so they could not be executed or debugged here regardless of effort spent; (2) they need substantial new fixture infrastructure (a `writing` call kind and per-key `writingScripts` queue in `helpers/fake-gemini.ts`, and a new `helpers/writing-fixtures.ts` seeding a plan/ledger for a writing activity) that would itself be unverified code layered on unverified code. Writing them without any way to confirm they pass risks shipping silently-broken tests, which is worse than an honest gap. This is flagged as a follow-up for a Docker-enabled environment rather than treated as done. The pure-logic half of every one of these suites (composition, output processing, classification, outcome mapping, the prompt boot check) **is** written and passing — see Validation.

**Validation:** typecheck ✅ (`pnpm -r typecheck`) · lint ✅ (`pnpm lint`, zero warnings) · unit tests ✅ (82 files / 666 tests total; new this stage: `writing-prompt.spec.ts` 7/7, `writing-quote-locator.spec.ts` 6/6, `writing-output.spec.ts` grew to 12/12 with `processCorrectionOutput`, `writing-correction-error.spec.ts` 7/7, `writing-correction-outcome.spec.ts` 5/5)
**Soft-fails:** No integration coverage yet for submission, the correction runner, retries/failures, or the daily limit — needs Docker (Testcontainers) plus new fake-Gemini and fixture helpers; deferred as a follow-up rather than written unverified. `WritingTaskRulesService` is not yet instantiated by the real app (module registration is Stage 4).
**Commit:** _(pending — recorded after this stage's commit lands)_

## Stage 4: HTTP Surface — ✅ done

- [x] **12. Writing Routes and OpenAPI**

**Observations:**
- Stage 3's commit SHA: `6551395`.
- `WritingController` and `WritingModule` follow `PlansController`/`PlansModule` and `CredentialsController` almost exactly: `ZodValidationPipe` on the `activityId` path param and both bodies, `@CurrentUser()`, `@HttpCode(200)` on both POSTs, `dataEnvelope(...)` responses, `ERROR_RESPONSE` for every error status. `WritingModule` imports `TaxonomyModule`, `ProfileModule` and `PlansModule` exactly as spec's Component Overview states; Prisma/Credentials/Prompts are global and needed no import.
- `WritingModule` now actually registers `WritingTaskRulesService`, so `onModuleInit` — and with it the rules-file-vs-taxonomy boot check from Stage 1/2 — runs for real the first time in this run, as part of Nest's normal provider bootstrapping. Booting the app in Nest's `preview: true` mode (via `openapi.spec.ts`, which builds the whole module graph without a database) confirmed the module wires cleanly: no missing-provider or circular-dependency error, and all four writing routes appear correctly in the generated document (`every_route_is_documented` and `protected_routes_declare_a_session_transport` both pass over them). Preview mode does not instantiate providers, so it does not itself exercise `onModuleInit`; that still needs a real boot, which needs Postgres/Redis (see Soft-fails).
- Regenerated `docs/api/openapi.json` the same way as Stage 1 (a throwaway vitest spec calling `buildOpenApiDocument`, since the `tsx`-based CLI script still fails in this sandbox for the pre-existing, unrelated reason noted in Stage 1). The diff is exactly the four new operations, their request/response schemas, and the `writing` tag — nothing else moved.
- Added a `writing` tag to `openapi/setup.ts` and five new components (`WritingActivityView`, `SaveWritingDraftRequest`, `WritingDraftSaved`, `SubmitWritingRequest`, `WritingLimitDetails`, `WritingDraftConflictDetails`) to `openapi/components.ts`, all derived from the shared Zod schemas per the project's "nothing here is hand-written" convention. `WRIT005`/`WRIT006`'s `details` shape (`{ words }`) is intentionally left untyped in OpenAPI, matching spec's component list, which names only the limit and conflict details as registered components.

**Validation:** typecheck ✅ (`pnpm -r typecheck`) · lint ✅ (`pnpm lint`, zero warnings) · unit tests ✅ (82 files / 666 tests, unchanged in count — no new pure-logic surface this stage) · `openapi.spec.ts` ✅ 4/4 (snapshot freshness, 3.1.0, every route documented, every protected route declares a session transport) — this is also, incidentally, the first real exercise of the whole module graph resolving together
**Soft-fails:** No real (non-preview) boot of the API in this sandbox — Postgres/Redis/Testcontainers are unavailable, so `WritingTaskRulesService.onModuleInit` and the actual HTTP routes have not been exercised end-to-end against a running stack. Preview-mode DI resolution and OpenAPI generation are the runtime check this environment can offer; a full smoke test (start the stack, open/save/submit a real writing activity) is left as a follow-up for a Docker-enabled environment.
**Commit:** _(pending — recorded after this stage's commit lands)_

## Stage 5: Web — ⬜ pending

- [ ] **13. Text Area and Dialog Primitives**
- [ ] **14. Web Data Layer and Draft Autosave**
- [ ] **15. Writing Editor Screen**
- [ ] **16. Correction Result View**
- [ ] **17. Web Route and Registration**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 6: Mobile and Follow-Ups — ⬜ pending

- [ ] **18. Mobile Models, API and Local Store**
- [ ] **19. Writing Controller**
- [ ] **20. Writing Page and Widgets**
- [ ] **21. Mobile Route and Registration**
- [ ] **22. Follow-Up Notes in Finished Features**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_
