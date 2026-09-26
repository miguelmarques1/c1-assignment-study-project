# Implementation Progress: Content Bank and Curated Import

**Status:** in progress
**Branch:** claude/content-bank-curated-import-044f65
**Started:** 2026-09-26
**Last updated:** 2026-09-26

## Stage 1: Contract and Data Model — ✅ done

- [x] **1. Shared Content Contract**
- [x] **2. Data Model and Migration**
- [x] **3. Curator Schema Files and Guide**

**Observations:**
- The worktree branch was created at F04 (`1f7a149`) while `main` was already at the F13 spec (`e8932bd`), 42 commits ahead. It was fast-forwarded to `main` before any work. The F13 spec and plan exist only from that commit on.
- `packages/shared/src/schemas/content.ts` follows the codebase's `xxxSchema` naming rather than the spec's bare names: `contentItemTypeSchema`, `importableContentTypeSchema`, `generatedContentTypeSchema`, `contentProvenanceSchema`, `cefrLevelSchema`, `contentAccentSchema`, `contentSkillSchema`, `questionFormatSchema`. The field builders keep the spec's names (`targetTagsField`, `questionsField`, `contentSlugField`).
- **Where the answer-key rules live (deviation from "`questionSchema` with per-format refinements").** The PRD pins the message `/questions/2/answer must be one of /questions/2/options`, which names a sibling by its absolute pointer. Only the enclosing array knows a question's index, so the answer-key checks (option membership, permutation, identity, complete pairs) are one exported function, `answerKeyIssues(question, index)`, run by `questionsField`. `questionSchema` keeps the rules that need no index: shape, duplicate options/segments/sides, one blank marker, equal `left`/`right` lengths. F16 can call `answerKeyIssues` directly if it ever needs to re-check one question.
- Zod v4 skips a refinement when a non-continuable (type) issue came first, as the docs state and a scratch run confirmed. So every type-dependent `meta.json` rule is a field-level rule on a per-type strict schema: `accent` is `contentAccentSchema` for listening and `z.never().optional()` elsewhere (`is only allowed for listening items`); `body` is required or optional by type; `skills` carries a per-type `must include "<type>"` refinement. With no item-level refinement on the curated schemas, a `meta.json` with several unrelated problems reports all of them. `generatedItemInputSchema` still needs one item-level check (`skills` must include `type`, except for `error_review`), which is skipped when another field has a type error. That is acceptable, because the other error is reported.
- `$schema` is an optional field of each curated schema, so strictness does not trip on the editor pointer. The importer ignores it.
- Added `curatedItemMetaJsonSchema(type)` to shared (not in the spec). `.meta()` descriptions and `uniqueItems` live in the registry of the Zod instance that built the schema, so emitting JSON Schema inside shared keeps the generator correct even if the API and shared ever resolve different Zod copies. Today both resolve `zod@4.6.5`.
- Also not in the spec: `apps/api/src/content/meta-schema.ts` (`buildMetaSchema`, `metaSchemaPath`, `renderMetaSchema`). `cli/schema.ts` runs `main()` on import, and the snapshot test has to rebuild the schemas in memory, so the builder has to be importable on its own. The snapshot test compares parsed JSON, not text, because `core.autocrlf=true` checks the files out with CRLF.
- Migration `0013_content_bank` is the spec's SQL verbatim. `0012` is left to F12 (`0012_learning_profile` on its branch). Prisma does not require contiguous numbering, and the two migrations touch unrelated tables, so either merge order works. `ContentItem` / `ContentItemServing` mirror it, and `User` gains `contentServings`. The migration was applied from scratch by Testcontainers (`seed.spec.ts`, 5/5). The CHECK constraints get their own direct-insert test in Stage 3 (`database_rejects_inconsistent_direct_inserts`).
- **`docs/api/openapi.json` changed, against the spec's "no change".** `apiErrorSchema.code` is `z.enum(Object.values(ERROR_CODES))`, so registering `CONTENT001`/`CONTENT002` adds two enum values to the `ApiError` component. No route or operation changed (still 24). Regenerated through `pnpm build` + `node dist/openapi/generate.js`: the `tsx` script still exits 1 silently, the gap F10 recorded.
- `.gitignore` audio patterns are now case-insensitive (`*.[mM][pP]3` and so on). The importer accepts `AUDIO.MP3`, but the old lowercase patterns would let that file into git on a case-sensitive checkout. Verified with `git -c core.ignorecase=false check-ignore`.
- `test/integration/helpers/content-fixtures.ts` is written in full now: valid builders for every type and format, the fixture taxonomy (plus `fixtureTaxonomyWith` for tags F11's regex doesn't accept, like `phoneme:/θ/`), `makeWav` and the content-root writer. The Stage 1 unit tests already use it.
- The `content:schema` script has no `--env-file`, because it reads no environment.

**Validation:** typecheck (shared, design-tokens, api, web) ✅ · lint ✅ · unit 275/275 (19 new: content-item-schema 17, content-meta-schema-snapshot 2) ✅ · integration `seed.spec.ts` 5/5 (applies every migration including 0013) ✅ · `pnpm content:schema` run, 4 files written ✅ · openapi snapshot regenerated (+2 enum values) ✅
**Commit:** _(recorded in the next stage)_

## Stage 2: The Importer — ⬜ pending

- [ ] **4. Media Probe**
- [ ] **5. Folder Scanner**
- [ ] **6. Validation Chokepoint**
- [ ] **7. Persistence Repository**
- [ ] **8. Import Orchestration**
- [ ] **9. Import CLI and Reporting**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 3: Query API, Statistics and Verification — ⬜ pending

- [ ] **10. Content Bank Service and Module**
- [ ] **11. Usage Statistics CLI**
- [ ] **12. Live Verification on the Real Stack**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_
