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
**Commit:** _(pending — see below)_

## Stage 2: Composition Core — ⬜ pending

- [ ] **5. Estimates and Tag Priority**
- [ ] **6. Candidate Ranking and Model Output Validation**
- [ ] **7. Plan Selection**
- [ ] **8. Carry-Over and Session Packing**
- [ ] **9. Rationale, Summary Line and Precedence**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

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
