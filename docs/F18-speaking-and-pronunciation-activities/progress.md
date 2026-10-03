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

## Stage 3: Scoring Service and Attempt Flow — ✅ done

- [x] **9. Scorer Service**
- [x] **10. Task Materialization and the Activity View**
- [x] **11. Upload Flow**
- [x] **12. Re-score, Lease and Audio**

**Observations:**
- `SpeakingScorerService.score()` branches on `shape === 'read_aloud' && durationMs <= SEGMENT_MAX_MS` for the direct-assessment path (no transcription); everything else (open response, or a long read-aloud) transcribes first. A direct read-aloud's `SpeechNoRecognitionError` (Azure's `NoMatch`) is translated to `discarded`/`not_enough_speech` specifically for that path, matching the spec's `no_match_discards_a_direct_read_aloud` test intent — a segmented path's persistent `NoMatch` instead fails the whole attempt (`service_error`), since A7 allows no partial attempt.
- `latencyMs` is measured with `Date.now()` around each provider call rather than trusted from the provider's own reported figure: `SpeechToTextService.transcribeClip` doesn't expose a `latencyMs` field (only the fuller `transcribeFile`/`SpeechTranscription` does), so wall-clock timing is the simplest self-contained option and needed no F08 change.
- `speaking_attempts.words` stores the *raw* merged evidence (`MergedWord[]`, phonemes included, matching the DB column's own comment) rather than the pre-rendered client-facing display words. `SpeakingViewMapper` re-derives `displayWords()` on every read from that raw evidence plus the task's reference text (or the attempt's own transcript for an open response) — a single source of truth, so the view can never drift from what was actually measured. `failing_phonemes` similarly stores every grouped instance (not just the worst), and the mapper picks the view's single example and taxonomy label at read time.
- `SpeakingViewMapper.toAttemptView` independently re-derives "is this `scoring` row actually stale" via `isStale(..., now)` on every read (not just inside a mutating transaction), so a `GET` immediately after a crash reports `failed`/`interrupted` even before any upload or re-score has run `markInterrupted` to fix the DB row itself.
- `SpeakingTaskRepository.insertIfAbsent` doesn't require an explicit `$transaction` — it already handles the `root_activity_id` race with a P2002 catch-and-read-back (mirroring `generation-run.repository.ts`'s `isUniqueViolation` precedent), so `SpeakingActivityService.materializeTask` calls it directly against `PrismaService`.
- **Validated the DI wiring for real, not just by inspection.** Two dead ends first: (1) `npx tsx` (esbuild) does not emit `design:paramtypes` decorator metadata reliably — Nest's error messages from a `tsx`-run script were red herrings, not real bugs; (2) testing `SpeakingModule` in isolation (even with the other `@Global()` modules added) hits unrelated pre-existing gaps (`GenerationModule`'s transitive `PromptExecutionService`, BullMQ worker teardown) that only exist because a partial module list omits modules `AppModule` already wires up in production. The reliable check was adding `SpeakingModule` to the real `src/app.module.ts` (needed for stage 4 anyway) and compiling the **whole** `AppModule` through `vitest`'s SWC-based transform (the same transform the real test suite uses, and the one `vitest.config.ts` explicitly notes esbuild can't substitute for). That resolved and instantiated `SpeakingAttemptService`, `SpeakingActivityService` and `SpeakingScorerService` cleanly. `app.module.ts`'s `SpeakingModule` import is therefore already in place, ahead of stage 4's own routes/controller.
- Also verified against the real local Postgres (started for stage 1): reran `prisma migrate deploy` / `prisma generate` unaffected by this stage's service-layer-only changes.
- No Testcontainers integration test files were written yet for the attempt/activity/re-score flows (`speaking-activity-routes.spec.ts`, `speaking-attempts.spec.ts`, `speaking-rescore.spec.ts`) — they exercise HTTP routes that don't exist until stage 4's controller lands, so they are deferred to close out alongside it rather than written against a route that isn't there yet.

**Validation:** typecheck ✅ (whole `apps/api` package) · lint ✅ (`eslint src test`, whole package) · full unit suite ✅ — 683/684 (same pre-existing `openapi.spec.ts` staleness expected until stage 4 regenerates the snapshot) · DI graph ✅ (`AppModule` compiles and resolves every new speaking provider via vitest/SWC) · migration re-verified against local Postgres. Soft-fail: no Docker in this container, so the Testcontainers-based integration suites for this stage's services are deferred to stage 4 (see above) and will still only be soft-fail-executable here even once written.
**Commit:** _(pending — see end of stage)_

## Stage 4: HTTP Surface — ✅ done

- [x] **13. Speaking Routes and OpenAPI**

**Observations:**
- The upload route reads the raw body itself (`readAudioBody`, stage 2) rather than any body-parser middleware: Nest's default JSON/urlencoded parsers skip a request whose `Content-Type` is `audio/wav`, exactly like the LiveKit webhook precedent, except here nothing needs `app.use(raw(...))` in `main.ts` at all — the controller's `@Req() req: IncomingMessage` still has the untouched stream.
- The audio-stream route uses Nest's `StreamableFile` (new to this codebase — no prior binary-response route existed to copy) rather than a hand-rolled `@Res({ passthrough: false })`; `Cache-Control: private, no-store` is still set via `@Res({ passthrough: true })` alongside it.
- Confirmed the spec's own implementation note the hard way: `apps/api/package.json`'s `openapi:generate` script runs through `tsx` (esbuild), which — consistent with stage 3's DI-check detour — does not reliably emit the decorator metadata Nest's Swagger module needs. Regenerating via `pnpm build && node dist/openapi/generate.js` (real `tsc`, as the spec's implementation note prescribes) produced the correct 5 new routes and 4 new components on the first try; the stale-snapshot run of `openapi.spec.ts` from stages 1–3 now passes.
- `SpeakingModule` now also registers `SpeakingController`; `app.module.ts`'s import (added in stage 3, ahead of schedule, to validate DI) needed no further change here.
- Wrote the three integration test files the spec's testing strategy names (`speaking-activity-routes.spec.ts`, `speaking-attempts.spec.ts`, `speaking-rescore.spec.ts`) plus a shared `helpers/speaking-fixtures.ts`, following `pipeline-fixtures.ts`'s and `plan-activity-state.spec.ts`'s established patterns exactly (`seedSpeaker` for BYOK-aware login, direct `speaking_tasks` row seeding to bypass corpus selection for deterministic reference text, the same fake Azure clients at the client boundary F08/F10 already provide). They cover the AC-mapped scenarios: storage key, format/duration rejection, the direct and transcribed scoring paths, the 10-word floor, the attempt limit, retention/replay, the best-attempt profile write, plan state transitions, client-id replay, the BYOK gate and audit labels, and (in the re-score file) a failed assessment re-scored without re-recording, a rejected key invalidating itself, quota, a non-rescorable audio rejection, the limit, cross-user privacy and the audio stream's headers.
- These three files could only be typechecked and linted, not executed — this container still has no Docker daemon, and they need real Postgres/Redis/MinIO via Testcontainers. Logged as a soft-fail; they are structurally sound (reasoned through by hand against the fakes' exact per-key/per-reference-text scripting contract) but unverified by a real run.

**Validation:** typecheck ✅ (whole package) · lint ✅ (whole package) · full unit suite ✅ — 684/684, including `openapi.spec.ts` now that the snapshot is regenerated · OpenAPI regenerated and committed. Soft-fail: the three new integration test files (Testcontainers-based) are typechecked and linted only, not executed, for lack of a Docker daemon in this container.
**Commit:** _(pending — see end of stage)_

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
