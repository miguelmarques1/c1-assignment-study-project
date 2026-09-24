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
**Commit:** `42c4a61` — F09 spec/plan and stage 1 - contracts, rules and data model

## Stage 2: Selection stage — ✅ done

- [x] **5. Selector**
- [x] **6. Pronunciation focus port**
- [x] **7. Writer and reader**
- [x] **8. Stage handler and pipeline order**
- [x] **9. Adapting F08's suites**

**Observations:**
- **Deviation (the focus seam is a class port, not a token):** the spec described a `PRONUNCIATION_FOCUS_SOURCE` token with an interface and a `NoPronunciationFocus` provider. The codebase already has an idiom for "a seam a later feature fills": F06's `scenario/profile-tags.port.ts`, an injectable class with a neutral implementation that F12 replaces (`apps/api/AGENTS.md`, "Layout"). F09 follows it. `PronunciationFocusPort.focusFor(userId)` returns `NO_PRONUNCIATION_FOCUS` (`{ source: 'none', tags: [], matchesWord: () => false }`), and tests override the class with `overrideProvider`. The contract F12 fills is the same. The spec is corrected in stage 4.
- The spacing check only looks at accepted starts within one window of the candidate. An overflowing window must contain the new start, and every start in such a window lies within `spacing_window_ms` of it, so `max_per_window + 1` consecutive sorted starts spanning less than the window is the exact test. `never_places_more_than_3_in_any_5_minute_window` checks every selected start's window on 100 packed utterances.
- The ranking's last key is the utterance id, after `idx`. Within one transcript `idx` is unique, so this never decides anything there. It makes the order total for any input, and that is what `is_deterministic_for_the_same_input_and_rules` (5 shuffles, twice each) relies on.
- **A regression found by the full integration suite, in F08's harness, and fixed there.** With F09's handler registered, every F08 test that stops watching once transcription completes leaves an excerpt-selection job running after it. The next test's `beforeEach` then deleted every lesson while that job's completing transaction held rows of the same lesson, and Postgres reported `40P01 deadlock detected` (`transcription-pipeline.spec.ts > a_stale_run_commits_nothing`, in its reset, 247/248 on the first full run). `resetPipelineTables` now waits, for up to 10 s, until the `lesson-pipeline` queue has nothing active, waiting, prioritized or delayed before it deletes. This is not a production path, because nothing in the product deletes a lesson.
- **F08 suites adapted, as the spec planned.** `completion_advances_the_branch_to_excerpt_selection` now waits for selection's run 1 to complete and for the branch to rest at `pronunciation_assessment` / `queued`. `ignores_stages_without_a_registered_handler` targets `pronunciation_assessment`. In the pipeline routes, `returns_the_callers_branch_with_every_stage` lists four stages, `retry_is_rejected_when_nothing_failed` now reports `pronunciation_assessment` / `queued`, and `retry_reruns_downstream_stages` asserts selection really re-ran (run 2 `completed`) instead of sitting `queued`. That test also had to let selection's first run settle before failing transcription by hand, or selection could move the pointer back over the hand-made failure. In the transcript routes, `a_transcript_is_readable_before_later_stages_finish` rests at `pronunciation_assessment`. The pipeline-route fixtures needed no selection seeding: they all go through the real transcription, whose default phrases are too short to be eligible, so selection completes empty and deterministically.
- `createPipelineTestContext` shortens the new stage's policy too (`excerpt_selection: 3 attempts, 40 ms`). New helpers: `makeTranscribedLesson` (what F08's completing transaction leaves: a transcript, a branch at `excerpt_selection` / `queued`, a completed transcription row and a queued selection row, with no audio uploaded), `seedTranscript` and `startSelection`.
- **Runtime check on the real local stack.** The dev server under `nest start --watch` recompiled on its own and logged `Loaded excerpt selection rules v1 (e4e9f122dbd2)`. A scratch lesson (`room = 'f09-live-check'`, `bf65d9bf-…`) was inserted through SQL for both seeded users with transcripts at `excerpt_selection` / `queued`. `you` got 18 utterances covering every rule edge: 2 999 / 3 000 / 30 000 / 30 001 ms, 7 and 8 words, 40% and 50% fillers, confidence 0.39 and 0.40, a dense 12:00–14:30 stretch, and later turns. `partner` got only two-word backchannels. The expected output was computed first with the pure selector on the same data, through a throwaway script in the scratchpad. **The dev server's own drain picked both branches up within 2 s, and each stage ran in 33–38 ms** (under the PRD's 2 s). `you`: 13 eligible, 9 selected, identical to the prediction in rank, start and reason. Only 2 came from the dense stretch, because the 0.40 utterance at 9:40 already fills that 5-minute window. `partner`: 0 eligible, an empty selection, `sparse_sample = true`. Both branches rest at `pronunciation_assessment` / `queued`, with rule version `1`, fingerprint `e4e9f122dbd2…` and focus `none` / `[]`. The scratch lesson is kept for stage 3's route check and is deleted in stage 4.
- **F07's finalization suite, fixed on the way (test-only).** After the deadlock fix, the second full run failed `recording-finalization.spec.ts > one_missing_track_fails_only_that_branch`. Two standalone reruns failed again, each on a different test (`a_failed_recording_requests_a_fallback_plan_for_that_participant_only`: fallback called twice; `the_launch_port_receives_the_verified_object_key_per_participant`: launch never called). This is the fixture race F07's and F08's progress logs already describe. `makeEndedLesson` creates the lesson `finalizing` before its participants and segments exist, and `RecordingFinalizationJob`'s own 5 s `@Interval` finalizes it half-built. That suite mocks the pipeline launch, so no F09 code runs in it, but it failed often enough to hide a real regression. Every test there drives finalization itself through `runFinalizationOnce()`, so the suite now removes the `recording-finalization-sweep` interval from Nest's `SchedulerRegistry` right after boot. Three standalone runs in a row after that: 20/20 each. Production code is unchanged. F07's recorded follow-up is appended as resolved in stage 4.
- The stage 3 merge-test extension had been drafted early and fails typecheck until stage 3 changes `mergeTranscript`. It was set aside as a patch in the scratchpad so stage 2 validates, and committed, on its own.

**Validation:** `pnpm -r typecheck` ✅ · `pnpm lint` ✅ · `vitest run test/unit` ✅ 176/176 (adds `excerpt-selector.spec.ts` 23 and `excerpt_selection_retries_at_5s_and_30s`) · `excerpt-selection-pipeline.spec.ts` ✅ 14/14 on its first run · `pnpm --filter @english-quest/api test:integration` ✅ 248/248 across 22 files on the third full run. The first full run found the reset deadlock (247/248); the second found F07's fixture race (247/248). Both are fixed and recorded above. `recording-finalization.spec.ts` passed 3× standalone after its fix · real-stack runtime check (above).
**Commit:** `b82e71e` — F09 stage 2 - selection stage

## Stage 3: Transcript exposure and document — ✅ done

- [x] **10. Transcript route extension**
- [x] **11. OpenAPI document**

**Observations:**
- `TranscriptService` reads the caller's selection through `ExcerptSelectionReader.forParticipant(lessonId, callerId)`, and only the caller's: another participant's selection is never read on this path. `mergeTranscript` takes the caller's badges as a `utteranceId → excerpt` map, and only the caller's own track ever looks it up. `projects_the_excerpt_only_onto_the_callers_utterances` passes it a map that also names the other speaker's utterance, and nothing leaks. `durationMs` in the badge is derived from the stored range (`end_ms − start_ms`), not stored twice.
- `TranscriptionModule` imports `ExcerptSelectionModule` for the reader. There is no cycle: excerpts imports only the pipeline module.
- The transcript route's `@ApiOperation` description now names `excerpt` and `myExcerptSelection`. That one-line description change is this stage's whole `docs/api/openapi.json` diff: the schemas themselves changed in stage 1.
- The new route tests use a `selectionFailed` option on `makeTranscribedLesson` for the "null until selection runs" case. A failed selection stage has no job, so the app's own 15 s drain cannot race the assertion. A merely queued stage could be picked up mid-test.
- **Real-stack check of both routes on the running dev server, with bearer tokens for both seeded accounts,** against stage 2's scratch lesson. The server restarted on its own after the last edit (`Found 0 errors`, then `Nest application successfully started`, before the reads).
  - `you` sees `myExcerptSelection` = v1, 18 considered, 13 eligible, 9 selected, 77 000 ms, not sparse. `excerpt` appears on exactly 9 of their 18 utterances, ranks 1–9, and rank 1 reads `Selected: recognition confidence 0.40, 10 words`.
  - `partner` sees their own summary: 5 considered, 0 eligible, 0 selected, sparse, and no `excerpt` anywhere.
  - In both directions, the other speaker's utterances carry no `excerpt`, `confidence` or `words` key. `GET …/pipeline` shows `recording`, `transcription` and `excerpt_selection` as `completed` and `pronunciation_assessment` as `queued` for each user.

**Validation:** `pnpm -r typecheck` ✅ · `pnpm lint` ✅ · `pnpm --filter @english-quest/api test:unit` ✅ 177/177 (includes the extended merge test and the committed-snapshot test on the regenerated document) · `openapi:generate` ✅ (22 operations, description-only diff) · `transcript-routes.spec.ts` ✅ 11/11 · `pnpm --filter @english-quest/api test:integration` ✅ 251/251 across 22 files · real-stack route check (above).
**Commit:** `6a0c4e7` — F09 stage 3 - transcript exposure and document

## Stage 4: Verification and hand-off — ✅ done

- [ ] **12. Live verification**: everything required is done. The two optional items (the real-speech confidence distribution and the two-window lesson) were not run, see below. Left unticked on purpose.
- [x] **13. Follow-ups for neighbouring features**

**Observations:**
- **Live checklist, as run:**
  - Branches waiting at `excerpt_selection` before F09's first boot: **none** (stage 1). So the first boot selected nothing, as the dev server's quiet drain confirmed.
  - Scratch lesson exercising every rule edge, for both seeded users: selected by the dev server's own drain within 2 s, 33–38 ms per stage, and identical to the pure selector's prediction (stage 2).
  - `GET …/transcript` and `GET …/pipeline` as each seeded user, with bearer tokens: own badges and summary only, and no detail on the other speaker's lines (stage 3).
  - Scratch data deleted afterwards (`f09-live-check`): the cascade removed its selections, excerpts, transcripts, utterances and stage rows. No audio object was ever uploaded for it.
- **Soft-fail: the real-speech confidence distribution (optional) was not run.** It transcribes a real 5–10-minute recording through F08 with the user's Azure key, about 10 minutes of their quota, and the spec requires their go-ahead. An autonomous run cannot get that. It is the evidence rule version 2 would be calibrated on, and it is listed as open below.
- **Soft-fail: the real two-window lesson (optional) was not run.** It needs two live participants in the user's own Chrome, which this environment cannot provide (F05/F07/F08 precedent).
- **Follow-ups written:**
  - F09's spec was corrected in place wherever the implementation differs, each change marked as corrected or added during implementation: the `PronunciationFocusPort` class seam instead of the token, `excerpt-tokens.ts`, the fixtures (`makeTranscribedLesson`, `failedAtTranscription`, `selectionFailed`, `startSelection`), the settling reset, and F07's suite in the test tables.
  - F07's progress got an appended, dated note: its finalization-suite fixture race is resolved (test-only).
  - F08's progress got an appended, dated note: F09's answer to the confidence follow-up, the adapted F08 tests, the settling reset, and the missing terminal branch status for the pipeline's last stage.
  - The spec's notes for F10 (the reader contract, file offsets, completing without an aggregate on an empty selection, the stage name fixed here), F12 (replace `PronunciationFocusPort`, version the `source`), F19 (render `excerpt.reason`, add the Dart models) and the final stage (terminal branch status) match what was built.

**Validation:** documentation-only changes in this stage (spec, progress logs). The code was validated at stage 3's close. The full re-run is in the final verification below.
**Commit:** _(none)_
