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
**Commit:** `c2751cf` — F18 stage 1 - contracts, corpus and data model

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
**Commit:** `97d0aee` — F18 stage 2 - scoring core

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
**Commit:** `f4dc5b8` — F18 stage 3 - scoring service and attempt flow

## Stage 4: HTTP Surface — ✅ done

- [x] **13. Speaking Routes and OpenAPI**

**Observations:**
- The upload route reads the raw body itself (`readAudioBody`, stage 2) rather than any body-parser middleware: Nest's default JSON/urlencoded parsers skip a request whose `Content-Type` is `audio/wav`, exactly like the LiveKit webhook precedent, except here nothing needs `app.use(raw(...))` in `main.ts` at all — the controller's `@Req() req: IncomingMessage` still has the untouched stream.
- The audio-stream route uses Nest's `StreamableFile` (new to this codebase — no prior binary-response route existed to copy) rather than a hand-rolled `@Res({ passthrough: false })`; `Cache-Control: private, no-store` is still set via `@Res({ passthrough: true })` alongside it.
- Confirmed the spec's own implementation note the hard way: `apps/api/package.json`'s `openapi:generate` script runs through `tsx` (esbuild), which — consistent with stage 3's DI-check detour — does not reliably emit the decorator metadata Nest's Swagger module needs. Regenerating via `pnpm build && node dist/openapi/generate.js` (real `tsc`, as the spec's implementation note prescribes) produced the correct 5 new routes and 4 new components on the first try; the stale-snapshot run of `openapi.spec.ts` from stages 1–3 now passes.
- `SpeakingModule` now also registers `SpeakingController`; `app.module.ts`'s import (added in stage 3, ahead of schedule, to validate DI) needed no further change here.
- Wrote the three integration test files the spec's testing strategy names (`speaking-activity-routes.spec.ts`, `speaking-attempts.spec.ts`, `speaking-rescore.spec.ts`) plus a shared `helpers/speaking-fixtures.ts`, following `pipeline-fixtures.ts`'s and `plan-activity-state.spec.ts`'s established patterns exactly (`seedSpeaker` for BYOK-aware login, direct `speaking_tasks` row seeding to bypass corpus selection for deterministic reference text, the same fake Azure clients at the client boundary F08/F10 already provide). They cover the AC-mapped scenarios: storage key, format/duration rejection, the direct and transcribed scoring paths, the 10-word floor, the attempt limit, retention/replay, the best-attempt profile write, plan state transitions, client-id replay, the BYOK gate and audit labels, and (in the re-score file) a failed assessment re-scored without re-recording, a rejected key invalidating itself, quota, a non-rescorable audio rejection, the limit, cross-user privacy and the audio stream's headers.
- These three files could only be typechecked and linted, not executed — this container still has no Docker daemon, and they need real Postgres/Redis/MinIO via Testcontainers. Logged as a soft-fail; they are structurally sound (reasoned through by hand against the fakes' exact per-key/per-reference-text scripting contract) but unverified by a real run.
- *Stage 5 follow-up (confirmed during the web stage's own `pnpm -r test` run):* all three files do run and fail the same way every other Testcontainers-based integration suite in this repo fails here — `Could not find a working container runtime strategy` from `startMinio`, not a logic failure — confirming the soft-fail is purely environmental, not a defect in the test files themselves.

**Validation:** typecheck ✅ (whole package) · lint ✅ (whole package) · full unit suite ✅ — 684/684, including `openapi.spec.ts` now that the snapshot is regenerated · OpenAPI regenerated and committed. Soft-fail: the three new integration test files (Testcontainers-based) are typechecked and linted only, not executed, for lack of a Docker daemon in this container.
**Commit:** `61a6846` — F18 stage 4 - speaking routes and OpenAPI

## Stage 5: Web — ✅ done

- [x] **14. Web Data Layer and Route Registration**
- [x] **15. Capture and Playback Hooks**
- [x] **16. Speaking Runner Components**
- [x] **17. Speaking Page, Dashboard Card and Design Reference**

**Observations:**
- `packages/design-tokens`'s `dist/` was missing entirely at the start of this stage (never built in this container) — `apps/web`'s typecheck failed on every file importing `@english-quest/design-tokens`, not just new speaking files. Fixed by running `pnpm --filter @english-quest/design-tokens build` once; unrelated to anything this stage wrote, so no code changed for it.
- TypeScript 5.9's DOM lib makes `Uint8Array` generic over its backing buffer (`Uint8Array<ArrayBufferLike>` by default). A bare `Uint8Array` return/parameter type doesn't satisfy `fetch`'s `BodyInit` (which wants `ArrayBufferView<ArrayBuffer>`) under this TS version — `encodeWav`'s return type and `uploadAttempt`'s `wav` parameter both had to be written as `Uint8Array<ArrayBuffer>` explicitly, not just `Uint8Array`.
- jsdom's own `Blob` has no `arrayBuffer()` method, which `useWavRecorder.finish()` needs on the blob `MediaRecorder` hands it. Every test exercising that path (`wav-recorder.spec.ts`, `speaking-runner.spec.tsx`) stubs the global `Blob` with Node's own (`import { Blob } from 'node:buffer'`), which does implement it.
- `useWavRecorder` and `useAttemptAudio` are tested against the real browser-API surface (a fake `MediaRecorder`, `getUserMedia`, `AudioContext`) rather than mocking the hooks themselves in `speaking-runner.spec.tsx` — the same global stubs as `wav-recorder.spec.ts`, reused so the runner test exercises the real hook code, not a stand-in for it. `@testing-library/react`'s `waitFor` polls with real timers; `vi.useFakeTimers()` together with it just hangs (RTL's own poll never fires), so the auto-stop-at-limit test uses a tiny real `maxRecordingSeconds` (50 ms) instead of faking the clock.
- F16 and F17 (which the spec's Component Overview names as the natural owners of `components/activity/difficulty-rating.tsx` and the bank-activity runner precedent) have no `spec.md`/`plan.md` or any implementation yet — confirmed by `ls docs/F16-*` and `docs/F17-*` before building. `DifficultyRating` is therefore new, first-implementation code here (per the spec's own "(or F16's, A24)" allowance), and the speaking runner has no sibling runner to mirror; its layout follows the design-system primitives and `TodaySessionCard`'s established shell/state conventions directly, with no corresponding mockup (A24's precedent: a screen the PRD requires but the mockup set never drew).
- `PlanActivityView` already carries `rating`/`notUseful` fields (from F15), but no client builds a rating UI yet anywhere in the web app — `DifficultyRating` is the first.
- `word-colouring.tsx`'s `BAND_CLASS` was module-private; exported it per the spec (additive, no rendering change) for `SpokenWords` to reuse, exactly as F19's `wordLabel`/`BAND_LABEL` were already public.
- The runner's rendering is derived entirely from `useWavRecorder`'s own `status` plus two local flags (`uploadFailure`, `resultAttemptId`) rather than a separately-tracked `phase` enum — avoids the two ever disagreeing about which screen is up. The spec's named states (`ready`/`recording`/`review`/`submitting`/`result`/`upload_failed`/`blocked`/`mic_denied`/`no_microphone`/`unsupported`) are all represented, just as derived conditions instead of a stored field.
- `RecorderPanel` hides its own record button once `attemptsRemaining` reaches 0 (a `canRecord` prop), rather than the runner swapping in a different component — keeps the "All 3 attempts used" counter text and the controls in one place.
- A server block (`plan_archived`/`activity_skipped`) hides the recorder and the difficulty-rating widget but keeps the attempt list and replay visible (read-only per the failure-modes table's "Read-only: list and replay"); `azure_key_missing` only hides the recorder — the attempt list, replay and rating stay available since none of those need the key.
- `PronunciationPracticeCard`'s four states follow A25's literal cascade order (no plan → key not ready → next activity → all done): even when every speaking activity is already done, a plan with no ready Azure key still shows the key message rather than "all done" — matches the spec's ordering exactly, not a judgement call.
- `design/README.md`'s "Treino de Pronúncia" row flipped from `deferred` to `implemented`; the sibling "Módulos Essenciais" header row's note was also updated (it referenced only F15's card shipping standalone — now both F15's and F18's do, still with zero actual grid members).
- No Testcontainers-based integration testing applies to this stage (pure client code, no server to spin up); every check here is typecheck, lint and Vitest/RTL component tests, all of which actually run in this container (web has no Docker dependency at all).

**Validation:** typecheck ✅ (whole `apps/web` package, after fixing the pre-existing unbuilt `design-tokens`) · lint ✅ (whole repo's `pnpm lint`, zero warnings) · full web unit/component suite ✅ — `pnpm --filter @english-quest/web test`: 242/242 across 40 files (34 new this stage: `wav-encoder`, `wav-recorder` ×5, `attempt-audio` ×4, `spoken-words` ×4, `difficulty-rating` ×3, `attempt-list` ×5, `speaking-runner` ×5, `pronunciation-practice-card` ×4) · `pnpm -r typecheck` and root `pnpm lint` both clean across the whole monorepo · confirmed (via this stage's own `pnpm -r test` run) that the three Stage 4 integration test files fail only on the environmental `Could not find a working container runtime strategy`, not on logic — see the Stage 4 follow-up note above. No runtime smoke test against the dev server: this container has no browser and the dev server was not started this stage (Stage 6 and the final verification step are better points to do a combined runtime check across web, mobile and API together).
**Commit:** `dc72f3f` — F18 stage 5 - web

## Stage 6: Mobile and Follow-Ups — ⬜ pending

- [ ] **18. Recorder and Player**
- [ ] **19. Mobile Models, API and Controller**
- [ ] **20. Speaking Screen and Routes**
- [ ] **21. Today Pronunciation Card**
- [ ] **22. Follow-Up Notes in Finished Features**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_
