# Implementation Progress: Lesson Scenario and Role Cards

**Status:** in progress
**Branch:** main
**Started:** 2026-09-23
**Last updated:** 2026-09-23

## Stage 1: Contracts, prompt and data model — ✅ done

- [x] **1. Situation prompt revision**
- [x] **2. Shared scenario contract**
- [x] **3. Scenario data model and migration**

**Observations:**
- `scenario-situation.yaml` is now `version: "2"` with `vocabulary_domain` as a second required variable. The template tells the model to build on the given domain and return it unchanged; the response schema is untouched, so the model still echoes the domain but the server's own choice is what gets persisted (Stage 2). The example's `vocabulary_domain` was changed from free text (`freelance work, risk and negotiation`) to `workplace negotiation`, one of the 15, so the example itself models the contract. Added a fourth constraint line forbidding a substituted domain.
- Added `loads_scenario_situation_v2_with_the_vocabulary_domain_as_an_input` to `apps/api/test/unit/prompt-file-loader.spec.ts`. That suite previously only exercised fixtures, so nothing pinned the real v2 file's variable contract; the boot suite (`prompt-boot.spec.ts`) only checks that it loads.
- **Deviation — shared contract:** added `roleCardStatusSchema` (`pending`/`ready`/`failed`) and `registerSchema` alongside the schemas the spec names, since a card's status vocabulary differs from the scenario's (no `no_scenario`). `roleCardSchema`'s content fields are nullable: a `pending` or `failed` card has a status but no content, and the role label lives on the view (`myRoleLabel`) so a failed card still carries it.
- `vocabularyDomainSchema` is a `z.enum` of the PRD's 15 in the PRD's own order; `sharedSituationSchema.vocabularyDomain` is typed against it, so an API response can never carry a paraphrased domain.
- Error codes `SCEN001` (409), `SCEN002` (409), `SCEN003` (403) added with pinned messages; `AppError.rerollLimitReached(limit)` overrides the message with the live ceiling and carries `details.limit`, the same pattern as `classroomFull`.
- **Deviation — migration SQL style:** written with quoted identifiers, matching `0004_lessons`, rather than the spec's unquoted draft. Primary-key and foreign-key constraints are inline, so Postgres names them (`lesson_role_cards_pkey`, `..._lesson_id_fkey`) rather than the spec table's `pk_*`/`fk_*` names — the spec's own SQL produces the same result, and 0004 does the same. Check constraints and indexes carry the spec's names exactly.
- The unique index on `lesson_scenarios.lesson_id` is declared in Prisma as `@unique(map: "ux_lesson_scenarios_lesson")`, so unlike 0004's partial index there is no desired-state drift for a future `prisma migrate dev` to propose dropping.
- Applied `0005_lesson_scenarios` against the local Docker Postgres (`docker compose exec -T api ... prisma migrate deploy`, then `prisma migrate status` → up to date) and inspected `\d lesson_role_cards` to confirm the check constraints landed. Docker Desktop was not running at the start of the run and had to be started.
- `docs/api/openapi.json` regenerated now: the error-code enum gained `SCEN001`–`SCEN003` (no new paths yet), and the committed-snapshot test would otherwise fail. It is regenerated again in Stage 3 once the routes land.

**Validation:** `pnpm --filter @english-quest/shared build` ✅ · `pnpm -r typecheck` ✅ · `pnpm lint` ✅ · `pnpm --filter @english-quest/api test:unit` ✅ 96/96 · migration applied cleanly to local Postgres, Prisma client regenerated.
**Commit:** _(recorded in the next stage's commit)_

## Stage 2: Generation — ✅ done

- [x] **4. Vocabulary domain rotation**
- [x] **5. Shared situation generation**
- [x] **6. Role assignment and private card generation**
- [x] **7. Generation orchestration**

**Observations:**
- `DomainRotationService.chooseDomain(participantUserIds)` reads each participant's own last-5-lessons window (by `lesson_participants.joinedAt` desc) and excludes the union of domains found there; when every domain is excluded it falls back to the one used longest ago across those participants' history (never throws). Unit-tested directly against a hand-rolled Prisma double (`apps/api/test/unit/domain-rotation.service.spec.ts`, 5 tests) rather than deferred to Stage 5, since the service has no HTTP surface of its own and is cheap to verify in isolation now.
- `SituationService` owns every write to `lesson_scenarios`. `ensureScenarioRow` is idempotent the same way `LessonService.tryOpenLesson` is (insert, catch the unique-violation, re-read). `generate()` distinguishes "opener has no valid key" (`CREDENTIAL_UNAVAILABLE`/`CREDENTIAL_UNREADABLE` from `PromptExecutionService`, via `CredentialExecutorService`) from every other failure: the former marks `no_scenario`, everything else marks `failed` — F04 has already retried the schema validation once internally by the time either is thrown, so no second retry loop lives here. The persisted `vocabulary_domain` is always the server's own chosen value, never `result.data.vocabulary_domain` (the model's echo), per the spec's decision.
- **Deviation — reroll/retry mechanics live in `SituationService`/`RoleCardService`/`ScenarioOrchestratorService` now, not deferred whole to Stage 3.** The spec's Component Overview assigns `reroll`/`retry` to the orchestrator and "owns the order in which the situation and cards are produced" — implementing the mechanical reset-and-regenerate now (Stage 2) and leaving only the authorization/limit/lock **rules** for Stage 3's controller matches the plan's own split ("Generation orchestration" in Stage 2 vs. "Reroll and retry rules" in Stage 3). `beginReroll`/`beginRetry` do not check the reroll ceiling, the caller's identity, or `lessons.started_at` — they trust the caller already enforced those, which Stage 3 will.
- `RoleCardService.ensureCard` is idempotent (a `ready` card is left alone) and assigns a role label by reading which labels other participants' rows already carry, then picking a random free one — persisted *before* the model call, so a card that goes on to fail still carries the participant's role label (`myRoleLabel` on the read model, Stage 3, is fed by this). Any failure from `PromptExecutionService`, including the owner's own missing/invalid key, leaves the card `failed` uniformly — the PRD's per-card error message doesn't distinguish cause, unlike the situation's own `no_scenario` split.
- **Deviation — no explicit row-level locking for role-label assignment.** Two participants registering close enough together could theoretically race and read the same "free" label before either writes. Accepted for this scope: the PRD's participant cap is 2–4, real registrations come from separate human actions with natural spacing, and no acceptance criterion exercises concurrent registration. Flagged here rather than silently ignored.
- **`ScenarioOrchestratorService.onParticipantRegistered`** awaits only `ensureScenarioRow` (fast — one insert-or-read) before returning; the actual model calls run via a private `runInBackground` helper that fires the promise chain without awaiting it and logs instead of throwing on failure, so a scenario failure can never break `POST /classroom/token`. `classroom.service.ts` calls it without awaiting at all (`.catch()` only), matching the spec's "fire-and-forget from the request that triggers it" literally. `ClassroomModule` now imports `ScenarioModule`; `ScenarioModule` currently exports only the orchestrator (no controller yet — Stage 3 adds one to the same module).
- `reroll()`/`retry()` reset row state synchronously (so a `GET` right after returns `pending` immediately) and kick off the same private `regenerateSituationAndCards` helper used by the initial-registration path — one code path, exercised three ways, rather than three near-duplicate generation flows.
- **Observation for Stage 5 test-writing:** because generation is genuinely fire-and-forget and not awaited anywhere (including at the classroom.service call site), a background generation promise from one integration test can still be running when the next test's `beforeEach` resets the database, producing a caught-and-logged (not test-failing) `P2025` "no record found for update" when the stale promise finally tries to write. Observed while re-running the pre-existing `classroom.spec.ts` suite below — all 16 tests still pass, the noise is fully contained by `runInBackground`'s `.catch()`, but Stage 5's scenario integration tests will need to poll for the expected end state rather than assume generation completed synchronously, and may want a small "let background work settle" pause between tests that trigger it.
- Ran the pre-existing `apps/api/test/integration/classroom.spec.ts` (the suite most exposed to the `classroom.service.ts`/`classroom.module.ts` changes) against real testcontainers Postgres/Redis: all 16 tests still pass unmodified. The full `test/integration` directory was not re-run in this stage (`fileParallelism: false` makes a full run slow — each file boots its own containers); it runs in Stage 5/Step 6's full-suite verification instead.

**Validation:** `pnpm -r typecheck` ✅ · `pnpm lint` ✅ · `pnpm --filter @english-quest/api test:unit` ✅ 101/101 (96 pre-existing + 5 new `domain-rotation.service.spec.ts`) · `apps/api/test/integration/classroom.spec.ts` ✅ 16/16 against real Postgres/Redis (re-run after the classroom wiring change).
**Commit:** _(recorded in the next stage's commit)_

## Stage 3: The scenario surface — ⬜ pending

- [ ] **8. Authenticated scenario routes**
- [ ] **9. Reroll and retry rules**
- [ ] **10. Document regeneration**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 4: The classroom surfaces — ⬜ pending

- [ ] **11. Web scenario client and state**
- [ ] **12. Situation and role card components**
- [ ] **13. Waiting-area region and in-call panel**
- [ ] **14. Dashboard recommended-scenario card**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 5: Closing the loop — ⬜ pending

- [ ] **15. Design reference update**
- [ ] **16. Test suites**
- [ ] **17. Manual verification**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_
