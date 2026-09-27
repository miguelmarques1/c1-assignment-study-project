# Implementation Progress: Study Plan Generation

**Status:** in progress
**Branch:** claude/spec-writer-docs-prd-4e0234
**Started:** 2026-09-27
**Last updated:** 2026-09-27

## Stage 1: Contracts, Rules and Data Model — ✅ done

- [x] **1. Shared Plan Contracts and Error Codes**
- [x] **2. Study Plan Rules File**
- [x] **3. Data Model and Migration**
- [x] **4. Terminal Branch Status**

**Observations:**
- The worktree branch had no `node_modules`/Prisma client generated for this session yet: `pnpm install --config.virtual-store-dir-max-length=40` at root, then `npx prisma generate` and `pnpm --filter @english-quest/shared build` on the host, per the worktree gotchas note. Baseline before any change: API typecheck ✅, web typecheck ✅, design-tokens typecheck ✅, lint ✅, `flutter analyze` ✅ (0 issues).
- `packages/shared/src/schemas/plan.ts`: the full view contract (`CurrentPlanView`, `StudyPlanView`, `PlanHistoryView`, notes, tags, progress, ratings). Deliberately does **not** carry `composition`, `deterministicReason`, `promptId`/`promptVersion`/`model`, `modelSelectionStats`, `generationRunId`, `rulesVersion`/`rulesFingerprint` — those are curator/internal fields kept only on the `study_plans` row, per F13's "no admin UI, no browsing interface" precedent. The user-facing signal for "this plan has no new diagnosis" is the `notes` array, not a raw `composition` flag.
- `PLAN001`–`PLAN004` added to `packages/shared/src/errors/codes.ts` (status + message), matching the spec's §5 table exactly.
- `pipelineBranchStatusSchema` gains `completed`. `apps/api/src/pipeline/pipeline-state.service.ts`'s `complete()`: when `nextStageAfter` returns null (only true for `plan_generation` today), the branch pointer moves to `(stage, 'completed')` instead of being left wherever the last `queueStage` call put it. `movePointer`'s status union widened to admit `'completed'`.
- `apps/api/src/plans/rules/plan-rules.ts` follows `generation/rules/generation-rules.ts` closely: same `range`/`share`/positiveInt helpers, same fingerprint-over-canonical-JSON approach, same "never throws, returns issues" / "throws with every issue" split. One deviation: F14's fingerprint sorts order-free lists (genres, banned phrases) before hashing; every list in the study-plan rules file is semantically ordered (a CEFR preference, a filler alternation, a task's days), so none are sorted — noted in the function's own comment.
- `rules/study-plan.yaml` v1 fingerprint pinned in `plan-rules.spec.ts`: `17c442b62fb19df2723716d67fde8bb7702422ab471d27e680dedc0bb05b9f92`.
- Deliberately did **not** declare the two partial-unique indexes (`ux_study_plans_user_active`, `ux_plan_activities_carried_from`) or the partial index conditions in `schema.prisma` — only in `migration.sql` — following the documented precedent in `LessonPipelineStage`'s own doc comment ("same reasoning as `ux_lessons_open_room`"). Because `carried_from_activity_id`'s uniqueness isn't declared to Prisma, the `carriedTo` back-relation on `StudyPlanActivity` is generated as an array (`StudyPlanActivity[]`), not a nullable scalar; the at-most-one invariant is enforced by the database only. Same for `StudyPlan.superseded` (array, no uniqueness claimed — a defensive choice, not a documented invariant).
- Schema validated with `DATABASE_URL=<dummy> npx prisma validate` (no live DB needed for schema syntax), then `npx prisma generate` on the host. The migration itself is applied and proven against a real Postgres only when an integration suite exercises it (Stage 3–5), per Testcontainers running every migration from scratch.
- Added `a_completed_branch_reads_ready` to `lesson-status.spec.ts`: `deriveLessonStatus` already derives `ready` from the `lesson_analysis` stage row's own status, not from the branch pointer's status, so a `completed` branch needed no logic change — only the new test to pin the behaviour.

**Validation:** typecheck ✅ (api, web, design-tokens) · lint ✅ (zero warnings) · `pnpm --filter @english-quest/shared build` ✅ · API unit `npx vitest run test/unit`: 500/501 passing, 1 known-pending failure — `openapi.spec.ts::committed_snapshot_is_up_to_date`, stale because the new error codes and the widened branch-status enum reach `openapi/components.ts` through the shared schemas with no route changes yet; deliberately left unresolved until Stage 5 adds the plan routes and regenerates the snapshot once, rather than twice.
**Commit:** `571d35c` "F15 stage 1 - contracts, rules and data model"

## Stage 2: Composition Core — ✅ done

- [x] **5. Estimates and Tag Priority**
- [x] **6. Candidate Ranking and Model Output Validation**
- [x] **7. Plan Selection**
- [x] **8. Carry-Over and Session Packing**
- [x] **9. Rationale, Summary Line and Precedence**

**Observations:**
- Every file in `apps/api/src/plans/composition/` is pure (no DI, no I/O): `estimates.ts`, `tag-priority.ts`, `candidate-ranking.ts`, `model-selection.ts`, `plan-selection.ts`, `carry-over.ts`, `session-packer.ts`, `rationale.ts`, `summary-line.ts`, `precedence.ts`. All I/O (F12 readers, F13's bank, F14's generation, the compose prompt) stays in Stage 3's `plan-composer.service.ts`, which builds these pure functions' inputs and calls them in order.
- **Rationale casing (clarifies spec §5's "Rationale templates" note).** The template functions in `rationale.ts` interpolate `ctx.labelOf(tag)` verbatim — they do not lowercase anything themselves. The spec's "the taxonomy label with a lowercase first letter (phoneme labels unchanged)" rule is the CALLER's responsibility: Stage 3's composer will build the `labelOf` callback passed into every pure function as `(tag) => familyOf(tag) === 'phoneme' ? taxonomy.labelOf(tag) : lowerFirst(taxonomy.labelOf(tag))`. Recorded here so Stage 3 doesn't rediscover it.
- **`ComposedSelection` does not carry `focusTags`,** despite the spec's Component Overview cell for `plan-selection.ts` mentioning them in passing. `summary-line.ts`'s `focusTagsOf(activities, priority)` explicitly takes the *packed* activity list (plural, post-carry-over, post-session-packing) and is the actual implementation; focus tags are computed once by Stage 3 after `packSessions` runs, not by `selectPlan` before it (which doesn't yet know the final carried+capped activity set). A wording redundancy in the spec, resolved in favour of the more specific `summary-line.ts` row.
- **Deviation: quota-pinning is a rarely-triggered safety net, not the common path.** Because `plan-selection.ts`'s deterministic tail (`interleaveByKind`) processes the *entire* remaining ranked pool with no length cap, a listening or reading candidate already ends up in `activities` whenever one is eligible at all. The `quotaPinned` list therefore only fires when the per-tag cap (`maxPerPrimaryTag`, default 3) excluded every listening/reading candidate from the interleave — confirmed with a dedicated test (`plan-selection.spec.ts::pins_a_listening_item_the_deterministic_interleave_excluded_through_the_per_tag_cap`) that lowers the cap to 1 to force the edge case, since the default rules make it very hard to trigger with only a handful of fixture candidates.
- **Deviation: writing-task tag assignment rewritten mid-stage.** The first cut (`pickTagSet`, called independently per task) let task 1 greedily take up to `max` (2) tags before task 2 got a turn, so with only 2 analysis-family weaknesses total, task 2 ended up reusing task 1's tags — violating A9's "the two writing tasks take distinct tags". Replaced with `pickDistinctTagSets`, a round-robin allocator (one tag per task per round, preferring an unused tag, falling back to reuse only on round 0 when the pool is smaller than the task count) and reused for pronunciation and speaking's tag sets too, for the same fair-distribution reason. Caught by `plan-selection.spec.ts::writing_tasks_target_distinct_analysis_tags` before it was fixed.
- **Deviation: review-cap enforcement removes and best-effort replaces.** A11/A12 ask for a dropped review activity to be "replaced by the next non-review item that fits". Implemented as: remove the lowest-priority non-carried review activity (by insertion order, a proxy for "lowest priority" since a formal priority field isn't threaded through the packer), then try to backfill from the `unplaced` pool (ranked items the packer never placed) with the first non-review draft that still fits the same day's capacity; if the `unplaced` pool has nothing, the session is simply left one activity shorter rather than force-adding something unrelated. Carried review activities are never removed, even if the cap still can't be met after every non-carried review activity is gone (an edge case; documented in the function's own comment).
- **Filler activities** (session-packer's step 5, when a day is still under 2 activities after everything else) carry no target tags and a generic rationale ("Extra practice to round out a short session.") — a deliberate simplification versus threading the writing/speaking/pronunciation tag pools through to the packer, since by the time filler is needed the tagged task slots are already placed. Only reachable with a very small candidate pool (confirmed by `session-packer.spec.ts::a_tiny_pool_still_yields_at_least_two_activities_per_session_via_filler`, which packs from a single bank item).
- `rankPlanTags` (`tag-priority.ts`) mirrors F14's `rankTags` (`generation/planning/tag-ranking.ts`) closely but drops the `eligibleFamilies` filter: F15 targets every non-retired family, `phoneme:` included, since pronunciation task slots need it — unlike F14, which never targets phoneme (text generation can't train a sound).
- `candidate-ranking.ts`'s `isEligible` requires the CEFR level to be in `candidates.cefrLevels` even outside general mode (spec A7's "Eligible candidates are items at a CEFR level in `candidates.cefr_levels` **whose** target_tags intersect…" — both conditions, not either).

**Validation:** typecheck ✅ · lint ✅ (zero warnings, after removing one unused import `session-packer.spec.ts` flagged) · API unit `npx vitest run test/unit`: 593/594 passing, the same known-pending `openapi.spec.ts` failure as Stage 1 (still deferred to Stage 5). New test files: `plan-estimates.spec.ts` (6), `plan-precedence.spec.ts` (4), `plan-tag-priority.spec.ts` (8), `plan-candidate-ranking.spec.ts` (14), `plan-model-selection.spec.ts` (8), `plan-rationale.spec.ts` (19), `plan-carry-over.spec.ts` (6), `plan-selection.spec.ts` (9), `session-packer.spec.ts` (10), `plan-summary-line.spec.ts` (9) — 93 new tests, all green.
**Commit:** `b6b5675` "F15 stage 2 - composition core"

## Stage 3: Composition Service and Prompt — ✅ done (integration proof deferred to Stage 4)

- [x] **10. Additive Reads on Finished Features**
- [x] **11. Composition Prompt, Version 2**
- [x] **12. Plan Composer**
- [x] **13. Supersession and Activation**

**Observations:**
- `ErrorLedgerReader.lessonSightings(userId, tags, lastLessons=5)`: finds the user's most recent `lastLessons` **analysed** lessons via `profile_sources` rows of `kind='lesson_analysis'` (a lesson counts as analysed — and occupies a window slot — even if it produced zero occurrences of the tag being asked about), then counts, per requested tag, how many of those lessons have an `error_ledger_occurrences` row for it. Returns an entry for every requested tag, `{lessons:0, of, inLatest:false}` when never seen — `rationale.ts`'s templates already treat that the same as no evidence at all (falls to the "still on your error list" sentence), so no special-casing was needed downstream.
- `ContentBankService.candidatesFor(ids)`: deliberately has **no** served-window exclusion and no body fields — it exists purely so the composer can look up metadata for the ids F14's run just produced, which by construction were never served to anyone before.
- `study-plan-compose` v2's prompt file loaded and validated cleanly against F04's envelope + response-schema checks on the first write (`plan-prompt.spec.ts`'s 9 tests all passed without a second attempt), including its one example validating against the response schema.
- **`PlanComposerService.compose()` is the one place all of F15's I/O for one build happens** — F12 readers, F02's credential status, F14's `generateForPlan`, F13's pool, F04's `execute`. Everything after it (candidate ranking, offer building, selection, packing) is the pure Stage-2 code. `PlanActivationService.activate()` is the only writer.
- **Deviation, `deterministicNoteCode`:** the spec's A15 notes table only assigns the `gemini_key_missing` note to "a missing or rejected key" and to `analysis_blocked` plans — NOT to `model_call_failed` or `model_output_invalid` (the Failure-modes table says so explicitly: "no user note" for both). First draft of `deterministicNoteCode` mapped all four `DeterministicReason` values needing a "the model path didn't run" explanation onto the same note text, which would have shown a misleading "your Gemini key is missing" message when the key was actually fine and only the *compose call itself* failed or was discarded. Fixed before it reached a test: `model_call_failed` and `model_output_invalid` now earn no note at all, matching the spec's own Failure-modes table.
- **`no_profile` (general mode) earns no note of its own** — `generalMaterial: true` on the plan is what the `general_material` note keys off, independent of `deterministicReason`. Both can be true's on the same plan (e.g. a first lesson's `recording_failed` plan, which is simultaneously general-mode); `PLAN_NOTE_ORDER` places `recording_failed`, then `gemini_key_missing`, then `general_material`, so all applicable notes show in a stable order.
- **`PlanActivationService.activate` signature takes `lessonTime` as an explicit parameter** rather than re-deriving it from a DB read inside the service — the caller (Stage 4's stage handler and request job) already has the lesson row loaded to decide whether to build at all, so passing it in avoids a second query and keeps the activation transaction shorter.
- `PlanRepository`'s compound-unique `where` keys follow Prisma's actual generated field-name convention (`userId_lessonId_origin`), **not** the `map:`-aliased SQL constraint name (`ux_study_plans_user_lesson_origin`) — confirmed against F14's own `generation-run.repository.ts` (`userId_runKey`, not `ux_generation_runs_user_key`) before writing it, so this wasn't a trial-and-error fix.
- **No integration test written yet for the composer/activation pair in isolation.** Stage 4 wires the pipeline stage handler and the request job around them, and that stage's integration suites (`plan-generation-pipeline.spec.ts`, `plan-deterministic.spec.ts`, `plan-activation.spec.ts`) are what actually exercise `compose()` and `activate()` against a real (Testcontainers) Postgres — there is no consumer that calls them standalone before Stage 4 exists, so a Stage-3-only integration test would just be a smaller version of the same setup. Recorded here rather than silently skipped.

**Validation:** typecheck ✅ · lint ✅ (zero warnings, after removing two: an unused `PrismaService` import in `plan-activation.service.ts` and an eslint-disable-comment vitest flagged as unused in `plan.repository.ts`) · API unit `npx vitest run test/unit`: 602/603 passing, the same known-pending `openapi.spec.ts` failure (still deferred to Stage 5). New: `plan-prompt.spec.ts` (9 tests, all green — the prompt file itself, loaded and schema-checked by F04's real loader). `PlansModule` registered in `app.module.ts`; `PlanRulesService.onModuleInit` will load and validate `rules/study-plan.yaml` the next time the API boots.
**Commit:** _(pending — see below)_

## Stage 4: Triggers and Activity State — ⬜ pending

- [ ] **14. Plan Generation Stage**
- [ ] **15. Fallback and Interim Plan Requests**
- [ ] **16. Activity State Contract and History Reader**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 5: HTTP Surface — ⬜ pending

- [ ] **17. Plan Read Service and Retry**
- [ ] **18. Plan Routes and OpenAPI**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 6: Web — ⬜ pending

- [ ] **19. Web Data and Selection Helpers**
- [ ] **20. Plan Components and Icons**
- [ ] **21. Plan Pages and Navigation**
- [ ] **22. Dashboard Today Card and Design Reference**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 7: Mobile and Follow-Ups — ⬜ pending

- [ ] **23. Mobile Models, API and Controllers**
- [ ] **24. Today and Plan Tabs**
- [ ] **25. Follow-Up Notes in Finished Features**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_
