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
**Commit:** _(pending — see below)_

## Stage 3: Composition Service and Prompt — ⬜ pending

- [ ] **10. Additive Reads on Finished Features**
- [ ] **11. Composition Prompt, Version 2**
- [ ] **12. Plan Composer**
- [ ] **13. Supersession and Activation**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

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
