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

## Stage 2: Generation — ⬜ pending

- [ ] **4. Vocabulary domain rotation**
- [ ] **5. Shared situation generation**
- [ ] **6. Role assignment and private card generation**
- [ ] **7. Generation orchestration**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

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
