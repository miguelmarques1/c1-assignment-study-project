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

## Stage 3: Correction — ⬜ pending

- [ ] **8. Correction Prompt, Version 2**
- [ ] **9. Correction Output Rules**
- [ ] **10. Submission**
- [ ] **11. Correction Runner and Recovery Sweep**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 4: HTTP Surface — ⬜ pending

- [ ] **12. Writing Routes and OpenAPI**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

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
