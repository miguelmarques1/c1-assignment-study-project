# Implementation Progress: Learning Profile and Error Ledger

**Status:** in progress
**Branch:** claude/learning-profile-error-ledger-44d9aa
**Started:** 2026-09-25
**Last updated:** 2026-09-25

**Run setup:** the worktree branch was fast-forwarded to `main` (`f90378a`, F11 closed) before the run, and `spec.md` / `plan.md` were copied in from the main checkout, where they were untracked. F19 is implemented concurrently in another worktree on the same base, so this run takes F12's "F19 has not landed" path everywhere the spec offers one, and leaves the shared `english-quest` compose stack (which bind-mounts the main checkout) untouched: integration suites run on Testcontainers, and live checks use an isolated stack or read-only queries.

## Stage 1: Contracts, taxonomy and data model — ✅ done

- [x] **1. Shared contracts**
- [x] **2. Taxonomy version 2**
- [x] **3. Data model and migration**
- [x] **4. PRD alignment**

**Observations:**
- `packages/shared/src/schemas/profile.ts` is new with every schema the spec lists, plus two it implies: `competencySubScoresViewSchema` (the Pronunciation `subScores` object, named so the OpenAPI component and the Dart model have a type to mirror) and `ledgerListQuerySchema` (`tag`, 3–64 characters, the list route's `VAL001`). `ledgerSourceKindSchema` (`lesson` / `activity`) is shared by the example and source views. `pipeline.ts` gained `plan_generation`; `codes.ts` gained `PROF001` (404, `This error record could not be found.`). No client references a stage name yet (F19 adds the labels), so nothing else needed the new stage.
- **Taxonomy symbols confirmed live, not from the local database:** the dev database holds no `lesson_excerpt_assessments` rows at all (every earlier live check deleted its scratch lessons), so the spec's "confirm against the local assessments" had nothing to read. Instead, one real Azure pronunciation call (`TEST_AZURE_SPEECH_*` from `.env`, the F10 precedent) on an offline Windows TTS clip written to cover the inventory, through the project's own `PronunciationAssessmentClient`, with a throwaway script deleted afterwards. It returned 40 distinct symbols; a second short clip ("I like my time…") returned the missing `aɪ`. All 41 match the spec's list exactly, and the two open code points resolve as: **`g` is ASCII U+0067** (not `ɡ` U+0261), and `ɝ` (U+025D) and `ɚ` (U+025A) are both emitted. `ɹ` is U+0279.
- `error-taxonomy.yaml` is v2: family `phoneme` (label `Pronunciation`, `analysis: false`, `format: ipa`) with 41 tags labelled `/θ/ as in "think"` and a one-sentence description each; 77 tags in total. The header comment was rewritten (it still promised a `pronunciation` family and cited the slug-only pattern).
- The loader validates each tag against its family's format (`slug` `^[a-z]+:[a-z0-9-]+$`, `ipa` `^[a-z]+:/[^/\s]{1,4}/$`). Families gain a resolved `format` (default `slug`), and the loaded result gains `familyOf: ReadonlyMap<tag, family>`. **Fingerprint:** `format` joins a family's tuple only when it isn't `slug`, so v1's pinned fingerprint is still what v1 hashes to; v2 is pinned at `0b04072773…`. `the_analysis_tags_are_unchanged_by_v2` proves more than the spec asked: v2 minus the phoneme family hashes to v1's exact pin, so the three analysis families are byte-identical to v1 (F11's prompt `enum` and boot check untouched).
- `ErrorTaxonomyService` gained `has`, `familyOf` (null for unknown or retired) and `tagsInFamily`.
- Migration `0012_learning_profile` is the spec's SQL verbatim. The two stage checks' names were confirmed against `0011` (`ck_stages_stage`, `ck_branches_stage`). **Deviation (FK names):** the spec asks for `fk_*` names, but every earlier migration declares foreign keys inline and lets Postgres name them `<table>_<column>_fkey`, which is also Prisma's default `map`; the spec's own SQL block is inline too. Kept the codebase's convention, so `schema.prisma` needs no `map:` on any relation.
- `schema.prisma` gained the seven models and the back-relations on `User`, `Lesson` and `LessonUtterance`. `prisma format` was deliberately **not** run: it realigns 134 lines of unrelated models. `updated_at` on the new tables is `@default(now())` and written explicitly by the engine, not `@updatedAt`.
- **Migration not applied to the shared dev database** — deliberately. F19 runs concurrently against the same `english-quest` stack (which bind-mounts the main checkout, not this worktree), and applying `0012` there would put a migration in `_prisma_migrations` that the main checkout's code does not have. The migration is proven by Testcontainers instead (every integration suite applies every migration from scratch; `health.spec.ts` ran green with it), and the live checks in stage 7 use an isolated stack. The container-side `prisma generate` step is moot for the same reason.
- PRD: F12's taxonomy sentence now reads "about 40 grammar, vocabulary and discourse tags, plus one pronunciation tag for each en-US phoneme Azure reports", with `phoneme:/ɹ/` in place of the `stress:word-level` example (A13, A14).
- `docs/api/openapi.json` regenerated now, since the stage enum and the error-code list changed (F10/F11 precedent). The `tsx` script still exits 1 silently (the `emitDecoratorMetadata` gap F10 recorded); generated through `pnpm build` + `node dist/openapi/generate.js`. Diff: `plan_generation` in three enums, `PROF001` in the code list.
- Setup noise: `pnpm --filter @english-quest/design-tokens tokens:build` (needed in a fresh worktree) rewrites the three generated token files with LF endings; they were restored, not committed.

**Validation:** typecheck ✅ (all 4 projects) · lint ✅ · API unit 258/258 ✅ (`openapi.spec.ts` failed once on the stale snapshot, green after regenerating) · `error-taxonomy.spec.ts` 13/13 ✅ · `health.spec.ts` (Testcontainers, applies `0012` from scratch) 4/4 ✅
**Commit:** _(recorded in the next stage's commit)_

## Stage 2: Profile engine — ⬜ pending

- [ ] **5. Scoring and ledger rules**
- [ ] **6. Ingestion contract and service**
- [ ] **7. Readers and compact summary**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 3: Lesson ingestion and seams — ⬜ pending

- [ ] **8. Lesson source mapping**
- [ ] **9. Profile update stage and pipeline order**
- [ ] **10. Reconciliation job**
- [ ] **11. Profile seams**
- [ ] **12. Adapting earlier suites**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 4: Routes and document — ⬜ pending

- [ ] **13. Profile routes**
- [ ] **14. OpenAPI document**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 5: Web profile screen — ⬜ pending

- [ ] **15. Navigation and design reference**
- [ ] **16. Profile screen**
- [ ] **17. Ledger detail dialog**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 6: Mobile profile screen — ⬜ pending

- [ ] **18. Mobile primitives**
- [ ] **19. Profile models and controller**
- [ ] **20. Profile page and detail sheet**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 7: Verification and hand-off — ⬜ pending

- [ ] **21. Live verification**
- [ ] **22. Follow-ups for neighbouring features**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_
