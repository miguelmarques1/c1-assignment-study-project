# Implementation Progress: Speaking and Pronunciation Activities

**Status:** in progress
**Branch:** claude/eager-tesla-gl9atx
**Started:** 2026-09-28
**Last updated:** 2026-09-28

## Stage 1: Contracts, Corpus and Data Model — ✅ done

- [x] **1. Shared Speaking Contracts and Error Codes**
- [x] **2. Speaking Task Corpus**
- [x] **3. Data Model and Migration**

**Observations:**
- This container has no Docker daemon (Testcontainers, and `docker compose`, are unavailable this run). It does have a local Postgres 16 cluster and `redis-server`/`redis-cli` binaries pre-installed, started manually for sanity checks. No MinIO is installed or attempted.
- Verified the migration for real: started the local Postgres cluster, created a scratch database, and ran `prisma migrate deploy` through all 16 migrations (0001–0016) cleanly, then `prisma validate` and `prisma migrate status` (both clean), then inspected `speaking_tasks`/`speaking_attempts` with `psql \d` and confirmed every column, CHECK, unique/partial-unique index and FK matches `schema.prisma` and the spec exactly. (`prisma migrate diff --from-schema-datasource ... --to-schema-datamodel ...` reported spurious "missing" FK/index lines that direct `\d` inspection disproved — a quirk of that diff invocation, not real drift; disregarded.)
- `SpeakingTask.rootActivityId` uses `@unique(map: "ux_speaking_tasks_root_activity")` (not a bare `@unique`) so Prisma's expected index name matches the migration's hand-written one, following `User.email`'s precedent (`@unique(map: "users_email_key")`).
- Corpus (`apps/api/rules/speaking-tasks.yaml`, version "1"): 32 read-aloud passages (25–60 words each, plain-prose character set per A3) and 22 open-response prompts. Every one of the taxonomy's 49 `phoneme:` tags is drilled by exactly 2 of the 32 passages (verified mechanically, not just by construction); every `discourse:` (6) and `vocab:` (8) tag is targeted by at least 1 prompt. Content was authored by hand from a phoneme→example-word table, then checked with a throwaway Node script before being wired into the real Zod-validated loader — the same coverage/word-count/word-presence assertions now live permanently in `speaking-corpus.spec.ts`.
- `speaking-corpus.ts` takes a minimal `TaxonomyLookup` interface (`has`/`familyOf`/`tagsInFamily`) rather than depending on `ErrorTaxonomyService` directly, so the pure loader has no Nest dependency and the unit test can adapt the real loaded taxonomy or a fake one to it interchangeably.
- Pinned the corpus's sha256 fingerprint (`8bc2ff7f...`) in `speaking-corpus.spec.ts`, mirroring `error-taxonomy.spec.ts`'s `PINNED_FINGERPRINTS` pattern; bump the corpus `version` and add a new pin if the corpus content ever changes.

**Validation:** typecheck ✅ (`pnpm --filter @english-quest/api exec tsc --noEmit`, after `npx prisma generate`) · lint ✅ (`eslint src/speaking test/unit/speaking-corpus.spec.ts`) · `pnpm --filter @english-quest/shared build` ✅ · unit tests ✅ (`speaking-corpus.spec.ts`, 7/7) · migration applied and inspected against a real local Postgres (see Observations) — soft-fail: the project's own Testcontainers-based integration suite could not run (no Docker daemon in this container).
**Commit:** _(pending — see end of stage)_

## Stage 2: Scoring Core — ⬜ pending

- [ ] **4. WAV Validation and Body Reading**
- [ ] **5. Token Alignment and Segment Planning**
- [ ] **6. Attempt Result Assembly**
- [ ] **7. Attempt Policy and Profile Outcome**
- [ ] **8. Task Selection**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 3: Scoring Service and Attempt Flow — ⬜ pending

- [ ] **9. Scorer Service**
- [ ] **10. Task Materialization and the Activity View**
- [ ] **11. Upload Flow**
- [ ] **12. Re-score, Lease and Audio**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 4: HTTP Surface — ⬜ pending

- [ ] **13. Speaking Routes and OpenAPI**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 5: Web — ⬜ pending

- [ ] **14. Web Data Layer and Route Registration**
- [ ] **15. Capture and Playback Hooks**
- [ ] **16. Speaking Runner Components**
- [ ] **17. Speaking Page, Dashboard Card and Design Reference**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 6: Mobile and Follow-Ups — ⬜ pending

- [ ] **18. Recorder and Player**
- [ ] **19. Mobile Models, API and Controller**
- [ ] **20. Speaking Screen and Routes**
- [ ] **21. Today Pronunciation Card**
- [ ] **22. Follow-Up Notes in Finished Features**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_
