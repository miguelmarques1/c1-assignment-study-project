# Implementation Progress: Objective Activity Execution

**Status:** in progress
**Branch:** claude/f16-objective-activity-execution-4c854b
**Started:** 2026-10-10
**Last updated:** 2026-10-10

## Stage 1: Contracts and Data Model — ✅ done

- [x] **1. Shared Activity Contracts and Error Codes**
- [x] **2. Attempt Table and Migration**
- [x] **3. Storage Range Reads**

**Observations:**
- The migration took number `0018_objective_attempts`: F17 landed `0017_writing_activities` and F18 `0016_speaking_activities` before this run, as the plan allowed for. The SQL is the spec's, verbatim.
- `ACT001`–`ACT006` were free on this branch (F17 and F18 used `WRIT`/`SPEAK`), so the numbering is the spec's.
- `parseByteRange` lives in its own file (`storage/byte-range.ts`) so it is unit-testable without the S3 client; `StorageService.getObjectStream` stats the object first (missing vs unreachable), then issues the ranged `GetObject`.
- `ObjectiveSubmissionInput.answers` is capped at 5 here (at most one per question); the exact-coverage rule is the grader's (`answerIssues`).
- Docker Desktop was stopped at the start of the run; it was started and answered by Stage 1, so integration suites can run.
- Environment: `@msgpack/msgpack` is missing from this worktree's `node_modules` (F14 dependency), so `pnpm --filter @english-quest/api typecheck` reports two `TS2307` errors in `frequency-list-builder`. Pre-existing and unrelated; every other file typechecks.

**Validation:** shared build ✅ · api typecheck: only the 2 pre-existing `@msgpack/msgpack` errors · lint ✅ (touched files, zero warnings) · unit `activity-contracts` + `byte-range` + shared suite ✅ (21 + 7). The migration is exercised by the integration suites from Stage 3 (Testcontainers applies it from scratch).
**Commit:** b95b0dd F16 stage 1 - contracts and data model

## Stage 2: Correction and Outcome Core — ✅ done

- [x] **4. Question Checks and Projection**
- [x] **5. Answer Normalization and Grading**
- [x] **6. Profile Outcome Builder**
- [x] **7. Session Context**

**Observations:**
- All modules are pure and live under `apps/api/src/activities/objective/`, plus `activity.constants.ts`.
- `buildActivityOutcome` takes the **item's** target tags (not the plan activity's up-to-5 subset): F12's note for F16 says "per item target tag", and F12 drops tags outside the taxonomy anyway. Stage 3 passes `payload.targetTags`.
- `projectQuestion` builds each view field by field, so a field added to the stored question shape cannot leak by default (A3).
- `checkQuestion` classifies a schema-valid ordering/matching question as `format_unavailable` before looking at its key, so a defective ordering key is not reported as a curator defect F16 cannot judge yet.
- A fill-in-the-blank blank is `/_{3,}/` (F13's marker), not exactly three underscores.
- Test fixtures shared by the unit specs live in `test/unit/objective-test-data.ts`.

**Validation:** typecheck ✅ (only the pre-existing `@msgpack/msgpack` errors) · lint ✅ · unit 36/36 ✅ (question-check 8, normalization 7, grading 8, outcome 10, session-context 3).
**Commit:** 5fb452c F16 stage 2 - correction and outcome core

## Stage 3: Activity Services and Routes — ✅ done

- [x] **8. Attempt Repository and Service**
- [x] **9. Skip and Rating**
- [x] **10. Activity View**
- [x] **11. Listening Media**
- [x] **12. Routes, OpenAPI and Wiring**
- [x] **13. Curator Signals**

**Observations:**
- **F15 defect fixed (additive):** `PlanActivityStateService.resolveForOwner` documented `lineage` as the whole carry-over chain, but only walked forward from the id it was given. A runner holding the newest copy's id (what the plan view returns after a carry-over) could not see an attempt started on an older copy, so resume failed. It now walks back to the oldest copy first; the existing forward walk is unchanged. Covered by `plan-activity-state::resolves_the_whole_chain_from_the_id_of_any_copy` and F16's `an_attempt_started_before_carry_over_resumes_on_the_carried_copy`. F18's use of `lineage[0]` as the task root becomes the true root when called with a newer id, which is what its spec intends.
- `buildActivityOutcome` receives the **item's** target tags (`payload.targetTags`), as decided in Stage 2.
- `ObjectiveAttemptService.start` returns an existing attempt before the archived-plan check, so a graded or open attempt on a replaced plan stays readable (A9); a brand-new attempt there is `PLAN004`.
- The view re-grades the stored answers against the attempt's snapshot instead of persisting a result blob; grading is deterministic, so the result reads the same forever, and `results` stays a small per-question record for `content:stats`.
- `GET /activities/:id/media` sets `Content-Length`/`Content-Range`/`Cache-Control` through `res.set` and returns a bare `StreamableFile`; the content type is F13's `mediaContentType` for the stored extension.
- Curator stats window is F14's 90 days (`GENERATION_STATS_WINDOW_DAYS`), passed in as `since`.
- OpenAPI snapshot: `openapi:generate` (tsx) fails silently again (the F10/F11/F15 follow-up), so the snapshot was written through a throwaway vitest file calling `buildOpenApiDocument`, which keeps SWC's decorator metadata. The git diff is large only because the new paths shift the following sections.
- Integration fixtures: `activity-fixtures.ts` listens once on an ephemeral port (`app.listen(0)`) so concurrent requests share the server; with the default supertest behaviour two simultaneous calls fight over bind/close and one gets `ECONNREFUSED`.

**Validation:** typecheck ✅ (only the 2 pre-existing `@msgpack/msgpack` errors were fixed by `pnpm install`; clean now) · lint ✅ · API unit 98 files / 791 tests ✅ · integration: `activity-routes` 14/14, `objective-submission` 15/15, `activity-media` 6/6, `content-stats` 7/7, `plan-activity-state` and `plan-activation` ✅ against real Postgres, Redis and MinIO.
**Soft-fail:** the spec says the integration suites boot the fake Gemini to assert it saw zero calls. They do not; `no_ai_call_is_made_from_open_to_rating` asserts zero `prompt_execution` and `credential_usage` rows for the user instead, and the fixtures give users no Gemini key, so any call would have surfaced as `CRED002`.
**Commit:** _(recorded in the next stage's commit)_

## Stage 4: Web Runner — ⬜ pending

- [ ] **14. Web Data and Pure Helpers**
- [ ] **15. Audio Player Primitive and Icons**
- [ ] **16. Activity Shell**
- [ ] **17. Objective Runner and Results**
- [ ] **18. Activity Pages and Today**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 5: Mobile Runner and Follow-Ups — ⬜ pending

- [ ] **19. Mobile Models, API and Pure Helpers**
- [ ] **20. Mobile Design Widgets and Shell**
- [ ] **21. Mobile Runner Page**
- [ ] **22. Follow-Up Notes in Finished Features**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_
