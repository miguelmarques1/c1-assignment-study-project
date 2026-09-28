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

## Stage 2: Task Composition and Drafts — ⬜ pending

- [ ] **4. Task Composer**
- [ ] **5. Writing Repository**
- [ ] **6. Opening and Reading an Activity**
- [ ] **7. Draft Saving**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

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
