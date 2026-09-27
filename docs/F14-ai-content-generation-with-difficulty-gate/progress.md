# Implementation Progress: AI Content Generation with Difficulty Gate

**Status:** success
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
**Commit:** 600035b "F14 stage 1 - reference data and rules"

## Stage 2: The Difficulty Gate — ✅ done

- [x] **5. Target Structure Verification**
- [x] **6. Gate Checks and Metrics**
- [x] **7. Correction Notes**
- [x] **8. Output Mapping**

**Observations:**
- **Rules v1 amended before any item was generated under it.** Writing the fixtures showed two markers were too strict for ordinary C1 prose: `had … participle` allowed only two intervening words (`Had the museum simply added` has three), and the present and past perfect markers did not accept `now` or `still` (`have now rewritten`). Both were loosened, to up to four intervening words and the two extra adverbs. The v1 fingerprint pinned in Stage 1 (`372a576b…`) was re-pinned to `369ead23…9e4ca` instead of bumping to v2, because v1 had not left this branch and no item or attempt records it. Once the feature ships, any change bumps the version as the rules file says.
- **Where shape problems are found:** the mapper never validates or throws. It passes F13's union through with missing fields left absent, and the gate runs F13's own `validateGeneratedInput` (with a placeholder `gateMetrics`). Issues under `/questions` become the `questions` check, and every other issue except `/gateMetrics` becomes `item_shape`. When the count itself is wrong, F13's array-level `/questions` issue is dropped, because the gate's own "has N questions" line already says it.
- `GateReport` keeps `answer_evidence` out of `metrics` and returns it separately as `evidence`. Only the passing item's `gateMetrics` carries it, so an attempt row (Stage 4) can store metrics without any text from a failed draft, as A23 requires.
- `banned_phrases_found` stores `{ phrase, count }` pairs rather than the spec example's bare list, so the count the appendix quotes is also in the record.
- The learner-quote check compares word sequences, not characters: `words(normalizeForMatch(…))` on both sides, space-joined and space-padded, so punctuation between words cannot hide a reproduced run.
- **Fixtures (deviation in count):** the spec asked for two readings plus one short passage per short type. Two passages cover every case instead. `reading-library-letter.json` (491 words, 22 sentences, mean sentence length 22.32, TTR 0.574, OOF 12.5%) lists occurrences for six tags, and `short-museum-labels.json` (278 words, 12 sentences, 23.17, 0.622, 13.3%) for six. `test/fixtures/generation/fixtures.ts` filters the occurrences to whichever tags a slot targets, so one passage serves every short type and every tag pair. Both passed the real gate on the first measurement. Real C1 argumentative prose landing at 12.5% against the wordfreq top-3,000 is a sign the PRD's threshold is attainable but tight. The live run (step 18) will show what the model does.

**Validation:** typecheck ✅ · lint ✅ · unit: difficulty-gate 17, target-structures 7, gate-feedback 4, generated-item.mapper 8 = 36 new ✅; generation-rules 13 ✅ after the re-pin
**Commit:** a71ba27 "F14 stage 2 - the difficulty gate"

## Stage 3: Prompts and the Prompt Library Extension — ✅ done

- [x] **9. Prompt Library Options**
- [x] **10. Generation Prompts, Version 2**
- [x] **11. Boot Verification of Generation Prompts**

**Observations:**
- **F04 extension** as specified. `renderUserMessage(prompt, variables, options = {})` and `execute(userId, promptId, variables, options = {})`. An out-of-range `exampleIndexes` entry throws a new `InvalidExampleSelectionError` (a code bug, like `MissingRequiredVariableError`), and a blank appendix is ignored. `template-renderer.spec.ts` proves the rendering without options is unchanged. The dated note is in `docs/F04-prompt-library/progress.md`.
- **Exemplars:** three passages by G. K. Chesterton from *All Things Considered* (1908; the author died in 1936, so public domain in Brazil and the US), taken verbatim from Project Gutenberg ebook #11505 by text anchors rather than transcribed. "The Fallacy of Success" (126 words), "The Error of Impartiality" (136) and "On Running After One's Hat" (134) were each cut at a sentence boundary to stay within A17's 150 words. Gutenberg's `_italic_` markers were removed. The same three passages serve all four prompts, each with its own questions and occurrences for that prompt's focus. The error-review exemplars carry invented learner errors, never real data. Attribution is in each file's header comment. The Conversation (the spec's other suggestion) was not used: it is CC BY-ND, and a verbatim excerpt could not be fetched and checked as reliably as a Gutenberg text file.
- **Response schema** uses only the JSON Schema keywords the existing prompts already send to Gemini (`enum`, `minItems`, `maxItems`, `required`), with no `minLength` or `maxLength`. F11 found that Gemini rejects some keyword combinations, and these are the ones proven live. `target_occurrences[].tag` is a plain string with no `enum`, the combination F11's live check warned about.
- **Every constraint line is a YAML double-quoted string.** One contained `: ` and was parsed as a mapping, which F04's loader rejected as `/constraints/3 must be string`. The loader caught it at load, as designed.
- **The exemplar check found gaps in rules v1, which were fixed, and v1 was re-pinned again** (`4747a6f7…b008`; still no item generated under it). The connector lexicon lacked `but`, `as for`, `to begin with`, `for instance` and `for example`. The passive marker's adverb slot lacked `sometimes`, `usually`, `generally`, `frequently`, `commonly` and `seldom`. The hedge lexicon lacked `sometimes`, `often` and `usually`. Without these, ordinary prose such as `It is sometimes made an objection` or `But really this view…` would have its occurrences rejected as `no marker match`. The check is now a permanent test (`generation-prompts.spec.ts::exemplars_quote_their_evidence_and_occurrences_verbatim`): every exemplar's evidence and occurrences must be verbatim, and every occurrence must pass its markers.
- `verifyGenerationPrompts` takes the allowed formats from the rules in force (`GenerationRulesService`), so a rules change that drops `fill_blank` would also refuse a prompt still asking for it. `main.ts` calls it right after `verifyAnalysisPrompt`. The boot sequence itself is exercised live in Stage 5, and `test/integration/prompt-boot.spec.ts` still passes (6/6).
- `generation.constants.ts` gained `GENERATION_PROMPT_IDS`, and `prompt-variables.ts` holds `GENERATION_PROMPT_VARIABLES`, the single list the verifier compares against, plus the pure `buildPromptVariables`. Stage 4's slot generator only feeds it the ledger examples.

**Validation:** typecheck ✅ · lint ✅ (all of `apps/api/src` and `apps/api/test`) · unit: generation-prompts 8 new, template-renderer +4, prompt-execution.service +2, and generation-rules, difficulty-gate, target-structures, gate-feedback, mapper and prompt-file-loader re-run: 9 files, 90 tests ✅ · integration `prompt-boot.spec.ts` 6/6 ✅
**Commit:** 9c2446a "F14 stage 3 - prompts and the prompt library extension"

## Stage 4: Generation Runs — ✅ done

- [x] **12. Data Model and Migration**
- [x] **13. Batch Planning**
- [x] **14. Slot Generation**
- [x] **15. Generation Service and Module**

**Observations:**
- Migration `0014_content_generation` is the spec's SQL verbatim, and the three Prisma models mirror it. `User` gains `generationRuns`/`generationSlots`, and `ContentItem` gains `generationSlots`. The partial index `ix_generation_slots_user_type_completed` and every CHECK live only in the SQL. Testcontainers applied it from scratch in every integration suite. It has not been applied to a running stack yet (Stage 5).
- **The database caught a real bug.** Attempts that ended before the gate (key rejected, quota) were written with `Prisma.JsonNull`, a JSON `null`, and `ck_generation_attempts_gate` rejected them because a JSON null `IS NOT NULL`. The fix is `Prisma.DbNull`, which is SQL NULL. The AGENTS.md hint ("Prisma JSON null is `Prisma.JsonNull`") is right for JSON values and wrong for a nullable column that a CHECK treats as absent.
- **Planner behaviour worth knowing (spec A9 as built):** with a small ledger, round-robin plus "at most 2 items per tag" legitimately turns a type slot into a reading, or ends the plan early. The integration ledger (five tags) plans 7 slots, not 12: R, G, V, E, R, G, then a vocabulary slot that becomes a reading. Two planner unit expectations had assumed the full mix and were wrong. The planner was not. `uses_a_tag_in_at_most_two_items_and_prefers_unused_tags` now checks "fewest uses first" within one family, where compatibility cannot interfere.
- **Additions beyond the spec's file list:** `generation.contract.ts` also holds `generationRequestSchema` (Zod; `z.uuid()`, `runKey` pattern, `maxItems` 1–12 defaulting to 12), and the repository exports `RunWithSlots`, `GenerationNote`, `RecordedAttempt` and `AttemptWrite`. `SLOT_CONCURRENCY`, `SLOT_LEASE_MS` and `GENERATION_NOTES` are in `generation.constants.ts`, and `MAX_ATTEMPTS_PER_SLOT` sits next to the slot generator that enforces it. `GENERATED_CEFR_LEVEL` lives in the mapper (Stage 2).
- **Resuming a slot:** a failed attempt row keeps its structured `failures` inside `gate_metrics` (numbers and check names, never text), so a slot reclaimed after its lease rebuilds the same correction notes for attempt 2. `resumes_an_expired_slot_without_a_third_attempt` proves exactly one more call, with the rebuilt appendix.
- **Upfront key check:** `CredentialsService.list` status `missing` or `invalid` marks the new run `credential_missing` before any slot runs, so every slot falls back with zero calls. `invalid` covers both an upstream rejection and an undecryptable key (F02 writes `invalid` for both). `unverified` still tries. A run with no eligible tags gets no abandon reason and no note.
- **Concurrency:** two workers claim slots through `claimNextSlot` (`UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED)`). After a run-ending error, the other worker's in-flight call finishes and keeps its item, and no new call starts. The mid-run tests therefore assert "fewer calls than slots" and "exactly one generated", not an exact call count, because the order in which the two workers call the fake is scheduling-dependent.
- **Test support:** `fake-gemini.ts` gained a `generation` call kind (recognised by `target_occurrences` in the response schema), per-key `scriptGeneration` queues, a `generationResponder` hook (needed because two slots call concurrently), and `fakeGeneration`, which answers from the fixture passages using the type and tags read off the rendered prompt. `helpers/generation-fixtures.ts` seeds ledgers through F12's `ingestActivityOutcome` and curated items through F13's validation and repository. `COVERED_TAGS` are the five tags both fixture passages cover. The fake is CRLF in this checkout, so it was patched with a line-ending-aware script, since the plain `\n` anchors did not match.
- `generation-boot.spec.ts` sits under `test/integration` as the spec lists it, but needs no container. It swaps the constants module's paths with `vi.doMock` and runs Nest's own `moduleRef.init()`. A rules file that fails the Zod schema reports only schema issues, never semantic ones, the same as the excerpt rules. The test asserts that and nothing more.

**Validation:** typecheck ✅ · lint ✅ · unit: 60 files, 478 tests ✅ (367 baseline + 111 from F14 so far, including batch-planner 13, genre-picker 4, generation-error 6) · integration `content-generation.spec.ts` 20/20 ✅ · `generation-boot.spec.ts` 4/4 ✅
**Commit:** aba0394 "F14 stage 4 - generation runs"

## Stage 5: Curator Surfaces and Verification — ✅ done (step 18 partial, see soft-fail)

- [x] **16. Generation CLI**
- [x] **17. Generation Statistics**
- [ ] **18. Live Verification on the Real Stack**: everything that needs no real Gemini key ran live (below). The real-model runs (a small batch, a same-key repeat against real calls, a full batch with pass rates) did **not** run: see the soft-fail.

**Observations:**
- **CLI as built:** `content:generate <email> [--max N] [--run-key K] [--dry-run]` on `GenerationCliModule` (Prisma, Credentials, Prompts, Taxonomy, Profile, Content, Generation; no BullMQ and no scheduler, and without `ScheduleModule.forRoot` the vault's `@Cron` stays inert). `NestFactory.createApplicationContext` runs with `abortOnError: false`, so a boot refusal reaches the CLI's own catch as one message. The CLI guards the schema with a check on `content_generation_runs`, reusing F13's `ContentSchemaNotInitializedError` wording, and loads and verifies the prompts itself, since `createApplicationContext` does not run `main.ts`.
- **Deviation, streaming:** the spec asked for "streamed lines" per slot. `generateForPlan` returns once, and per-slot detail (attempt failures, item slug) is read after the run. So the CLI streams one progress line per settled slot (`… 3/11 slots settled`, from `onProgress`) and prints the per-slot lines and the summary at the end.
- **Boot order, observed live:** `NestFactory.create` does not run `onModuleInit`. `main.ts`'s prompt checks read the rules and the taxonomy lazily (`current()`), and `app.listen()` → `init()` loads them again, so both log their load line twice at boot. The pattern predates F14 (the taxonomy already did it) and is harmless. A missing frequency list therefore stops the process at `listen`, still before the API serves anything.
- `generation-stats.ts` counts a slot under the version of its **first** attempt, and leaves out slots that never reached a gate verdict (abandoned before a call, or only transport failures), as the spec's "≤1 regen" definition says. It is plain Prisma with no decorators, so `content:stats` stays a `tsx` script.
- README gained rows for the dry run, the real run and `frequency:build`. The root `package.json` gained `content:generate` in the same `docker compose exec -w` form F13 used.
- **Live verification (step 18), on an isolated compose project `english-quest-f14`** (API 3121, Postgres 5462, Redis 6399, MinIO 9130/9131, no LiveKit), started from this worktree with a gitignored worktree `.env` derived from the main one with the ports shifted. The shared `english-quest` stack was not touched. It was only read, once, see the soft-fail. Results:
  1. **Boot:** migrations applied from scratch through `0014`; the four v2 prompts loaded; rules `v1 (4747a6f77f20)` and list `en-lemmas-top5000@e03e7791da88 (5000 lemmas)` loaded; `verifyGenerationPrompts` passed; the API listened (`degraded` only because this stack has no LiveKit).
  2. **Synthetic user** `live-f14@example.test`, inserted with a throwaway hash and no Gemini key. Its ledger was seeded through F12's `ingestActivityOutcome` by a compiled throwaway script, which also proves `GenerationCliModule` wires from compiled code.
  3. **Dry run:** 11 slots, R/G/V/E round-robin, each tag in at most 2 items, the 11th (a vocabulary slot with no `vocab:` tag left) turned into a reading, and planning stopped at the 12th. Genres and topic domains were distinct, and exemplars rotated 1, 2, 3. Exit 0.
  4. **Keyless run** (`--run-key live-1`): zero `prompt_execution` rows (no Gemini call), 11 slots `dropped/credential_missing` with the PRD note, and progress lines 1/11…11/11. The **same run key again** returned the identical summary, and `content_generation_runs` stayed at 1. An unknown email printed `No user with email nobody@example.test.` with exit 1.
  5. **Curated fallback:** one temporary curated reading imported with `content:import`, then `--run-key live-2 --max 5`. Reading 1 → `curated zz-live-f14-reading`, and reading 5 → dropped because the only curated reading was already standing in for slot 1 (A6).
  6. **`content:stats`:** the Generation section printed `No slot reached the gate yet.` and `Runs: 2 (abandoned: 2 credential missing)`.
  7. **Boot refusal:** with the list renamed away, the restarted API printed exactly `Frequency list not found — the difficulty gate cannot run.` and never logged `API listening`. The file was restored in the same command, with no git diff.
  8. **OpenAPI:** regenerated from the container build (`node dist/openapi/generate.js`, 30 operations). The only diff was line endings, and the committed snapshot is unchanged in content.
  - The stack, its volumes, its local images, the worktree `.env`, the temporary content folder and the throwaway script were removed afterwards.
- **Soft-fail: no run against the real Gemini API.** The plan's step 18 asks for a real batch, a real same-key repeat and a full batch's pass rates. The isolated database has no user with a Gemini key, and the two ways to give it one both involve a real credential: copying `you@example.com`'s stored (encrypted) key from the shared database, which is F12's recipe, or storing the main `.env`'s `TEST_GEMINI_API_KEY`. Attempting the first, a read-only `pg_dump` of `users` and `user_credentials` into the session scratchpad, was stopped by the environment's safety classifier as personal-data handling. The dump was deleted unused and nothing was imported. So what the real model produces is still unmeasured: the first-pass and within-one-regeneration rates, and whether the thresholds (TTR ≥ 0.45 at up to 700 words is the likeliest to bite) are reachable in practice. The deterministic parts of that path (gate, regeneration, fallback, persistence, key routing) are proven against the fake at the SDK boundary.

**Validation:** typecheck ✅ (`pnpm -r typecheck`) · lint ✅ (`pnpm lint`, zero warnings) · unit `generate-report.spec.ts` 3/3 ✅ · integration `generation-stats.spec.ts` 5/5 ✅ · live on `english-quest-f14`: boot, migration, dry run, keyless run, idempotent repeat, curated fallback, stats, boot refusal, OpenAPI unchanged ✅ · live real-Gemini runs: ⚠️ soft-fail (above)
**Commit:** 1167c4e "F14 stage 5 - curator surfaces and verification"

## Final verification

**Full suite (whole repository, fresh, 2026-09-27):**
- `pnpm -r typecheck` ✅ (design-tokens, shared, web, api) · `pnpm lint` ✅ (zero warnings)
- API `npx vitest run` from `apps/api`: **100/100 files, 937/937 tests** ✅, every integration suite on Testcontainers. Baseline before F14 was 48 unit files / 367 unit tests. The F14 files: generation-rules 13, frequency-list 6, frequency-list-builder 6, text-metrics 13, target-structures 7, difficulty-gate 17, gate-feedback 4, generated-item.mapper 8, generation-prompts 8, batch-planner 13, genre-picker 4, generation-error 6, generate-report 3, template-renderer 11 (+4), prompt-execution.service 12 (+2), content-generation 20, generation-boot 4, generation-stats 5. `prompt-boot` 6/6 and `content-bank.service` 16/16 are unaffected.
- Web `pnpm --filter @english-quest/web test`: 29/29 files, 188/188 tests ✅ (untouched by F14)
- Mobile (untouched by F14): `flutter analyze` no issues, `flutter test` 79/79 ✅

**Component Overview walk-through:** all 49 paths in spec §4 exist with their described contents, including the four prompts at version `"2"`, the rules file, the frequency list and its README, migration `0014`, the F04 files, `main.ts`, `app.module.ts`, `content/cli/stats.ts`, both `package.json` files, the README, `.claude/rules/prompts.md` and F04's progress note. So do all 18 test files in §7 and the fixtures folder. **Missing from spec: none.** Additions beyond the spec, listed in the stage observations: `text/frequency-list-builder.ts`, the `GENERATION_NOTES`/`SLOT_*` constants, `generationRequestSchema` and the result types in the contract, `apps/api/test/fixtures/generation/fixtures.ts`, `test/integration/helpers/generation-fixtures.ts`, and the fake's `generationResponder`.

**Acceptance criteria (PRD F14), re-run fresh in the full suite above:**

| Criterion | Result |
|---|---|
| Generation produces reading, vocabulary, grammar and error-review items, and never listening items | ✓ `content-generation::generates_reading_vocabulary_grammar_and_error_review_and_never_listening`, `batch-planner::every_slot_tag_is_unmastered_and_never_listening` |
| A generation run is capped at 12 items and happens once per study plan | ✓ `batch-planner::never_plans_more_than_twelve_slots`, `content-generation::rejects_more_than_twelve_items`, `::a_second_call_with_the_same_run_key_makes_no_model_call` (also live: same run key, one run row) |
| Generated readings that pass the gate are 450–700 words with mean sentence length between 18 and 26 words | ✓ `difficulty-gate::reading_word_count_boundaries`, `::reading_mean_sentence_length_boundaries` |
| A generated reading with fewer than 12% of tokens outside the top-3,000 frequency list fails the gate | ✓ `difficulty-gate::fails_below_12_percent_outside_the_top_3000` |
| A generated item containing a banned phrase fails the gate | ✓ `difficulty-gate::fails_on_a_banned_phrase_from_the_rules_or_the_prompt` |
| A generated item with fewer than 3 occurrences of its required target structure fails the gate | ✓ `difficulty-gate::fails_with_fewer_than_three_occurrences_of_a_required_structure`, `target-structures::requires_a_marker_match_when_the_tag_has_markers` |
| A generated item with other than exactly 5 questions, or a question without exactly one correct answer, fails the gate | ✓ `difficulty-gate::fails_when_questions_are_not_exactly_five`, `::fails_when_a_question_has_no_single_correct_answer` |
| A failing item is regenerated exactly once with the failed checks appended to the prompt | ✓ `content-generation::regenerates_a_failing_item_once_with_the_failed_checks_appended`, `gate-feedback::lists_each_failed_check_with_measured_and_required_values` |
| An item failing twice is discarded and replaced by a curated bank item of the same type | ✓ `content-generation::an_item_failing_twice_is_replaced_by_a_curated_item_of_the_same_type` |
| No genre repeats within a user's last 5 generated readings | ✓ `genre-picker::never_picks_a_genre_from_the_last_five_generated_readings`, `content-generation::no_genre_repeats_within_the_last_five_generated_readings_across_runs` |
| Every generated item is persisted with provenance `generated`, its target tags, its gate metrics and the prompt id and version | ✓ `content-generation::persists_each_passing_item_with_provenance_tags_metrics_and_prompt_stamp` |
| The API refuses to boot when the frequency list file is missing | ✓ `frequency-list::refuses_a_missing_file_with_the_prd_message`, `generation-boot::refuses_to_initialise_when_the_frequency_list_is_missing`, and live on `english-quest-f14` |

**Cross-feature criteria, F14's side:**
- F04's prompt stamp is on every generated item ✓ (`persists_each_passing_item_…`).
- F02's key is used only on its owner's data ✓ (`uses_only_the_owners_gemini_key`, `error_review_prompt_carries_only_the_owners_quotes_and_no_summary`).
- F12's snapshot and ledger decide the target tags, and all of them are unmastered ✓ (`every_generated_items_target_tags_are_unmastered_for_its_owner`, `batch-planner::ranks_due_then_recurring_then_other_unmastered_tags`).
- Items are persisted through F13 and retrievable as candidates ✓ (`generated_items_are_returned_as_bank_candidates`).
- Every item id in a result exists ✓ (same test, `existingIds`). The composition half of the last two criteria is F15's.

**Smoke checks (6.4):** everything that needs no real Gemini key ran live on the isolated `english-quest-f14` stack (Stage 5):
- boot, with migration `0014` and the list, rules and prompts loaded;
- the CLI's dry run, keyless run, same-key repeat and unknown-email exit;
- the curated fallback, through a real `content:import`;
- `content:stats`'s Generation section;
- the boot refusal without the list;
- an unchanged OpenAPI snapshot.

**Regressions:** none.

**Soft-fails:**
- **No run against the real Gemini API** (plan step 18, items 2–4 of the spec's live list). Giving the isolated database a Gemini key means handling a real credential. Copying the shared database's `users` and `user_credentials` (F12's recipe) was stopped by the environment's safety classifier as personal-data handling. The dump was deleted unused, and the `.env`'s `TEST_GEMINI_API_KEY` route was not attempted either. Still unmeasured as a result:
  - whether the real model reaches the thresholds;
  - the first-pass and within-one-regeneration rates against the PRD's 95%;
  - prose quality;
  - whether Gemini accepts the v2 response schemas (their keywords are the ones already proven live).

  Everything deterministic around the model call is proven against the fake at the SDK boundary.
- The live checks ran on the isolated stack, not the shared `english-quest` one, so migration `0014` is not applied to the shared dev database. It applies on the next boot of an API running this code.

**Pre-existing failures:**
- `packages/design-tokens` `tokens.spec.ts > generation drift guard > generated_files_match_a_fresh_generation` fails because the CRLF checkout (`core.autocrlf=true`) differs from the LF generator output, as F13 recorded. F14 does not touch the package (`git diff c5d5a69 -- packages/design-tokens` is empty). Because of it, `pnpm -r test` stops at design-tokens, so API, web and mobile ran per package.

**Follow-ups:**
1. **Run the real-model check yourself** (it needs a real key). On a stack running this branch:
   - `pnpm content:generate <your email> --max 4 --run-key live-1`;
   - the same command again, expecting no new `prompt_execution` rows;
   - a full batch;
   - `pnpm content:stats`.

   Read one item of each type. If the within-one-regeneration rate is far from 95%, look at which checks fail. Tune the prompts first (bump their `version`), and the rules only if a threshold proves unreachable. TTR ≥ 0.45 at up to 700 words is the likeliest to be unreachable.
2. **F15** (spec §5 "Downstream notes"): call `generateForPlan` once per plan with a plan-unique `runKey`, and wire `onProgress` to `reportProgress`. Draw on the `generated` and `fallback` ids, fill `dropped` slots from the bank, show `notes`, and call `recordServed`. A run takes minutes (about 36 in the worst case) and can be resumed.
3. **F16:** generated items carry only `multiple_choice` and `fill_blank` questions. A difficulty rating is stored against the payload's `promptVersion`.
4. The pre-existing design-tokens CRLF drift is still open. A `.gitattributes` `eol=lf` rule for the generated files would fix it.
5. The shared dev database gains migration `0014` the next time its API boots with this code merged.
