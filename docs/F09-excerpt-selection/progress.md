# Implementation Progress: Excerpt Selection

**Status:** in progress
**Branch:** main
**Started:** 2026-09-24
**Last updated:** 2026-09-24

## Stage 1: Contracts, rules and data model — ✅ done

- [x] **1. Shared contracts**
- [x] **2. Rules file and loader**
- [x] **3. Data model and migration**
- [x] **4. PRD and agent docs alignment**

**Observations:**
- **Deviation (token normalization has its own file):** `normalizeToken` and `tokenize` live in `src/excerpts/excerpt-tokens.ts`, not in the selector. The rules schema must reject a lexicon entry that the selector's normalization would change, so both need the same function, and the rules land a stage before the selector. The spec's component table is corrected in stage 4.
- The rules schema is Zod v4 with `strictObject` on both sections, so a misspelled key (`max_excerpt`) fails the boot instead of being silently ignored. The file's snake_case keys are mapped to camelCase `ExcerptRules`, as the prompt loader maps its own. The lexicon is stored sorted.
- Version 1's fingerprint is `e4e9f122dbd2b5ae59546da8964c8b614c4ad996c79c5a4a9e7cc2aaa0d005e8`, pinned in `test/unit/excerpt-rules.spec.ts`.
- **Contract change ahead of its route logic:** `lessonTranscriptViewSchema.myExcerptSelection` is required (nullable), so `TranscriptService` returns `myExcerptSelection: null` from this stage on. That is true until stage 2 registers the handler; stage 3 replaces it with the real read. `docs/api/openapi.json` was regenerated here, as F08 did in its stage 1, because the committed-snapshot test fails otherwise: `LessonTranscriptView` gains `myExcerptSelection` and the optional `excerpt`, and the stage enums gain `pronunciation_assessment`. No new paths.
- Migration `0009_excerpt_selection` was applied to the local Postgres through the container. Clients were regenerated on the host and in the container. `\d` shows every check, index and cascading foreign key as specified. `prisma validate` passes with a `DATABASE_URL` in scope. `prisma format --check` reports the schema unformatted, but it already did so at HEAD (F01–F08's column alignment), so it was not run: it would have rewritten unrelated models.
- **Live pre-check from the spec's checklist, done before any F09 handler existed:** the local database has **no** branch waiting at `excerpt_selection` (only 4 branches, all failed at `recording`), and no stage rows at all. So F09's first boot selects nothing.
- PRD aligned: the F09 sparse sentence now covers a selection the spacing rule leaves under 4, and the badge example reads `Selected: recognition confidence 0.62, 14 words`. The acceptance criteria are unchanged. The AGENTS.md boot-time YAML gotcha now names `apps/api/rules` as well.
- The spec and plan themselves are committed with this stage, following F07's and F08's precedent.

**Validation:** `pnpm --filter @english-quest/shared build` ✅ · `pnpm -r typecheck` ✅ · `pnpm lint` ✅ · `pnpm --filter @english-quest/api test:unit` ✅ 152/152 (includes the 7 new `excerpt-rules.spec.ts` tests and the regenerated OpenAPI snapshot) · `pnpm --filter @english-quest/api test:integration` ✅ 234/234 across 21 files (Testcontainers applies 0001–0009 fresh) · `pnpm --filter @english-quest/web test` ✅ 126/126 · migration applied locally.
**Commit:** _(none)_

## Stage 2: Selection stage — ⬜ pending

- [ ] **5. Selector**
- [ ] **6. Pronunciation focus port**
- [ ] **7. Writer and reader**
- [ ] **8. Stage handler and pipeline order**
- [ ] **9. Adapting F08's suites**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 3: Transcript exposure and document — ⬜ pending

- [ ] **10. Transcript route extension**
- [ ] **11. OpenAPI document**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 4: Verification and hand-off — ⬜ pending

- [ ] **12. Live verification**
- [ ] **13. Follow-ups for neighbouring features**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_
