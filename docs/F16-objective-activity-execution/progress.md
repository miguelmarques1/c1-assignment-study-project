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
**Commit:** _(recorded in the next stage's commit)_

## Stage 2: Correction and Outcome Core — ⬜ pending

- [ ] **4. Question Checks and Projection**
- [ ] **5. Answer Normalization and Grading**
- [ ] **6. Profile Outcome Builder**
- [ ] **7. Session Context**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 3: Activity Services and Routes — ⬜ pending

- [ ] **8. Attempt Repository and Service**
- [ ] **9. Skip and Rating**
- [ ] **10. Activity View**
- [ ] **11. Listening Media**
- [ ] **12. Routes, OpenAPI and Wiring**
- [ ] **13. Curator Signals**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

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
