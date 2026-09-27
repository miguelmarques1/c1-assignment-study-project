# Implementation Progress: AI Content Generation with Difficulty Gate

**Status:** in progress
**Branch:** claude/spec-writer-docs-prd-6105c2
**Started:** 2026-09-27
**Last updated:** 2026-09-27

## Stage 1: Reference Data and Rules — ✅ done

- [x] **1. Frequency List Builder and Reference File**
- [x] **2. Text Measurement**
- [x] **3. Frequency List Loading and Boot Refusal**
- [x] **4. Generation Rules File**

**Observations:**
- The worktree branch was already at `main` (`c5d5a69`). It had no `node_modules`. Install followed the worktree notes: `pnpm install --frozen-lockfile --config.virtual-store-dir-max-length=40`, then the shared build, `tokens:build` (its CRLF-only changes reverted) and `prisma generate`. Baseline before any change: API typecheck ✅, API unit 48 files / 367 tests ✅.
- Dependencies added as the spec lists: `wink-lemmatizer@^3.0.4` (runtime) and `@msgpack/msgpack@^3.1.3` (dev). `wink-lemmatizer` is CommonJS with no types; `src/generation/text/wink-lemmatizer.d.ts` declares its `noun`/`verb`/`adjective` API.
- **Builder split (addition to the spec's file list):** the pure decode/aggregate/render functions live in `src/generation/text/frequency-list-builder.ts`, and `cli/build-frequency-list.ts` only parses arguments, fetches and writes. The same split F13 made with `meta-schema.ts`, so the builder is testable without running a CLI on import.
- **Lemma assignment, refined from "assigns each word to one lemma":** probing `wink-lemmatizer` showed context-free guesses such as `boss` → `bos`, `species` → `specie` and `clothes` → `clothe`. A form now joins its verb, noun or adjective lemma (in that order) only when that lemma is itself a listable word in wordfreq at most 1.5 Zipf below the form. `was` → `be`, `better` → `good` and `ran` → `run` still merge. The run-time lookup is unaffected either way, since it takes the best rank among the word and all its lemmas.
- The list was built from wordfreq commit `912caf64b657478d1dff1138efdc078947d54bb1` (master on 2026-09-27). Spot checks read as written-English frequency: `however` 273, `policy` 539, `significant` 1,125, `nevertheless` 3,889, `hypothesis` and `ambiguous` beyond 5,000. wordfreq lists names lowercase (`dallas`, `jane`, `moscow` sit near rank 3,000). A19's exclusion only skips capitalised mid-sentence words the list does not know, so a listed name counts as an ordinary word.
- The list's version hashes the file with LF line endings, so a Windows checkout (`core.autocrlf=true`) and the container compute the same `en-lemmas-top5000@…`.
- **Rules file choices the spec left open:** `questions.count` is the literal 5 (F13's rule), `frequency_rank_cutoff` must lie in 1,000–5,000 (the list's size), `learner_quote_run_words` ≥ 3, and genres are capped at 40 characters (the slot column's width). The allocation order (`GENERATED_ITEM_TYPES`: reading, grammar, vocabulary, error_review) is exported from the rules module, since the fingerprint and the planner both read it.
- Marker regexes are written against the normalised quote (lowercase, straight apostrophes). The two conditional markers use a lookahead on `n't` so backtracking cannot turn `wouldn't have` into a second-conditional match. Version 1's fingerprint is pinned: `372a576b…9c97`.
- **`GenerationModule` exists from this stage on** (the spec lists it with Stage 4's wiring), holding only the frequency list and rules services, and `AppModule` imports it. That makes step 3's boot refusal real now. `test/integration/health.spec.ts` boots the full `AppModule` through `createTestContext()`, and it initialised with both files loaded.

**Validation:** typecheck ✅ · lint ✅ (new and touched files) · unit: generation-rules 13, frequency-list 6, frequency-list-builder 6, text-metrics 13 = 38 new ✅ · integration `health.spec.ts` 4/4 (full `AppModule` boots with `GenerationModule`) ✅
**Commit:** _(recorded in the next stage)_

## Stage 2: The Difficulty Gate — ⬜ pending

- [ ] **5. Target Structure Verification**
- [ ] **6. Gate Checks and Metrics**
- [ ] **7. Correction Notes**
- [ ] **8. Output Mapping**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 3: Prompts and the Prompt Library Extension — ⬜ pending

- [ ] **9. Prompt Library Options**
- [ ] **10. Generation Prompts, Version 2**
- [ ] **11. Boot Verification of Generation Prompts**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 4: Generation Runs — ⬜ pending

- [ ] **12. Data Model and Migration**
- [ ] **13. Batch Planning**
- [ ] **14. Slot Generation**
- [ ] **15. Generation Service and Module**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 5: Curator Surfaces and Verification — ⬜ pending

- [ ] **16. Generation CLI**
- [ ] **17. Generation Statistics**
- [ ] **18. Live Verification on the Real Stack**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_
