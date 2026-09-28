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

## Stage 2: Scoring Core — ✅ done

- [x] **4. WAV Validation and Body Reading**
- [x] **5. Token Alignment and Segment Planning**
- [x] **6. Attempt Result Assembly**
- [x] **7. Attempt Policy and Profile Outcome**
- [x] **8. Task Selection**

**Observations:**
- `PronunciationAssessmentService.assessClip` and `ExcerptClipSlicer` actually live in `apps/api/src/speech/` and `apps/api/src/pronunciation/excerpt-clip.slicer.ts` respectively (not both under `pronunciation/` as a first skim of the spec's prose suggested) — `SpeechModule` already exports both F08's and F10's clip capabilities together, with a doc comment naming F18 as an intended second caller. `SpeakingModule` (stage 3) imports `SpeechModule`, not `PronunciationModule`.
- F10's `weightedScores` was a module-private function taking `AssessedExcerptInput[]`; exported it and widened its parameter to `ReadonlyArray<{ durationMs; scores }>` (a new `WeightableScores` interface) per A7. `AssessedExcerptInput` still satisfies it structurally, and `pronunciation-aggregate.spec.ts` (10/10) still passes unchanged.
- `readAudioBody` must be declared `async` (not a plain function returning `Promise<Buffer>`): its early validation throws (`VAL001`/`SPEAK004`) are synchronous by nature, and without `async` they escape as real exceptions instead of a rejected promise. Caught immediately by the unit tests (three failed on the first run, all for this reason) and fixed before moving on.
- `displayWords` and `recognizedWordCount` (`attempt-result.ts`) dropped the `shape` parameter the spec's Component Overview lists: the actual behavioural difference for read-aloud vs. open response reduces entirely to "was this recording transcribed first or not", which `recognizedWordCount(sttWordCount, assessedWords)` already captures via `sttWordCount` being `null` or not (a long, transcribed read-aloud behaves like an open response here, not like a direct one) — a `shape` parameter would be redundant and could disagree with it. Deviation, logged per the skill's adaptation rule.
- `attempt-policy.ts`'s `canUpload`/`canRescore` take `now` and treat a `scoring` row past `SCORING_LEASE_MS` as not holding the slot, so the "at most 3 scored, one in flight, a stale lease frees it" rules are fully unit-testable without a database — the service layer (stage 3) still has to actually flip that stale row to `failed`/`interrupted` in the same transaction, but the policy decision itself needed no DB round-trip to test.
- `task-selector.ts`'s "other unmastered phonemes" (A4 key 2) is computed by subtracting the activity's own `targetTags` from the caller-supplied `unmasteredPhonemes` list, so a caller doesn't have to pre-filter — matches the spec's "other" wording literally rather than trusting F12's raw `unmasteredTags()` output to already exclude the targets.
- No integration with real Prisma/DB in this stage — every new file here is a pure function or a boot-time file loader, so none of it needed the (unavailable) Testcontainers stack.

**Validation:** typecheck ✅ · lint ✅ (`eslint src/speaking test/unit/speaking-*.spec.ts`) · full unit suite ✅ — `pnpm --filter @english-quest/api exec vitest run test/unit`: 683/684 passing, the one failure being `openapi.spec.ts`'s committed-snapshot check, expected to go red until stage 4 adds the actual routes and regenerates `docs/api/openapi.json` (the new `SPEAK00x` error codes already changed the schema's enum). New speaking-only suites: `speaking-wav-header` 11/11, `speaking-audio-body` 8/8, `speaking-token-alignment` 8/8, `speaking-segment-planner` 8/8, `speaking-attempt-result` 10/10, `speaking-attempt-policy` 13/13, `speaking-outcome` 7/7, `speaking-task-selector` 9/9.
**Commit:** _(pending — see end of stage)_

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
