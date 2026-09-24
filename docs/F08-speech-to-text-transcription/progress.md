# Implementation Progress: Speech-to-Text Transcription

**Status:** in progress
**Branch:** main
**Started:** 2026-09-24
**Last updated:** 2026-09-24

## Stage 1: Dependencies, contracts and data model — ✅ done

- [x] **1. Queue dependencies and root wiring**
- [x] **2. Environment contract**
- [x] **3. Shared pipeline and transcript contracts**
- [x] **4. Data model and migration**
- [x] **5. PRD alignment**

**Observations:**
- `pnpm add` resolved **`bullmq` 6.3.8 and `@nestjs/bullmq` 12.0.0**, both newer majors than the spec was written against. `@nestjs/bullmq` 12 is ESM-only (`"type": "module"`). The API is CommonJS, so it loads through Node's `require(esm)`: Node 24.14 on the host, and 22.23 in the container, where it is unflagged since 22.12. Checked that this does not duplicate NestJS: `@nestjs/common` and `@nestjs/core` 11 are CJS-only, so the ESM package's imports resolve to the same cached instances the app uses. `bullmq` itself does get loaded twice (ESM by `@nestjs/bullmq`, CJS by our code), but the only place that matters is the worker recognizing our `DelayedError`, and it checks `err.name == 'DelayedError'` as well as `instanceof`. The dev server booted cleanly with the new root module.
- BullMQ 6 accepts `connection: { url }` directly, so the root config is just `REDIS_URL`. There is no hand-parsed URL and no shared ioredis instance, which would otherwise have to be closed by hand at shutdown. The root uses `forRootAsync`, so OpenAPI preview generation never opens a Redis connection. Confirmed: `openapi:generate` and the committed-snapshot unit test ran with no Redis involvement.
- **Deviation (shared contract layout):** to avoid an import cycle between `recording.ts` and the new `pipeline.ts`, the branch vocabulary (`pipelineBranchStatusSchema`, `recordingFailureCodeSchema`, and the stage enum behind `pipelineBranchStageSchema`) now lives in `pipeline.ts`. `recording.ts` re-exports the same names, so F07's imports and the barrel are unchanged.
- `docs/api/openapi.json` was regenerated in this stage, as F07 did in its stage 1: the error-code enum gains `PIPE001`/`PIPE002`, and `LessonRecordingView.mine.branch` gains the widened stage, status and failure-code enums. The committed-snapshot test fails otherwise. No new paths yet.
- Migration `0008_speech_transcription` was applied to the local Postgres, which already holds F01–F07 data (including the 14 lessons F07's finalizer swept). Prisma client regenerated on the host and in the container. `\d lesson_pipeline_stages` shows every check constraint and both indexes as specified. `prisma validate` needs a `DATABASE_URL` in scope on the host (`.env` isn't loaded for that command); with one set it reports the schema valid.
- The partial index `ix_stages_pending` follows the established pattern: raw SQL only, documented with a `///` comment on the model instead of a Prisma `@@index`.
- PRD aligned as the spec recorded (F08 Capabilities, F09 eligibility filter, F09 ranking and F09's criterion "lower recognition confidence is selected before higher"). `docs/context.md` never mentioned word-level confidence, so it needed no change.
- The `TRANSCRIPTION_LOCALE` env tests were written in this stage, not in stage 5. The three cases are small, and the existing `env.spec.ts` sits right next to the change.

**Validation:** `pnpm --filter @english-quest/shared build` ✅ · `pnpm -r typecheck` ✅ · `pnpm lint` ✅ · `pnpm --filter @english-quest/api test:unit` ✅ 120/120 (includes the regenerated OpenAPI snapshot and 3 new env tests) · `pnpm --filter @english-quest/api test:integration` ✅ 185/185 across 15 files (Testcontainers applies migrations 0001–0008 fresh; every suite boots `AppModule` with the new BullMQ root) · `pnpm --filter @english-quest/web test` ✅ 126/126 · migration applied locally and the API dev server rebooted cleanly with the new dependencies.
**Commit:** `8607c6f` — F08 spec/plan and stage 1 - dependencies, contracts and data model

## Stage 2: Pipeline runner — ✅ done

- [x] **6. Stage handler contract and registry**
- [x] **7. Pipeline state service**
- [x] **8. Queue and processor**
- [x] **9. Drain and resume job**
- [x] **10. Launch from recording**

**Observations:**
- **Deviation (job id):** BullMQ refuses `:` in custom job ids (`Custom Id cannot contain :`), because it separates its own Redis keys with it. So the id is `{stage}-{branchId}-{run}` instead of the spec's `{stage}:{branchId}:{run}`. It is still deterministic, so enqueueing stays idempotent.
- **Deviation (how retries are scheduled):** retries do not use BullMQ's `attempts`/`backoff` options. On a retryable outcome the processor marks the stage `retrying` with `next_attempt_at`, moves the job to delayed (`job.moveToDelayed`, same id), and throws `DelayedError`. The attempt number comes from `job.attemptsStarted`. The reason is testability: BullMQ reads a custom backoff strategy from the `@Processor` decorator's static options, where the injected registry (and the integration suites' millisecond override, `PIPELINE_RETRY_OVERRIDES`) cannot reach. The spec's `UnrecoverableError` for non-retryable outcomes also isn't needed: the processor records `failed`/`blocked` itself and returns normally, so BullMQ never retries it.
- **Deviation (create-if-absent at launch and backfill):** both the launch and the drain's backfill use a new `PipelineStateService.ensureStage` (`createMany … skipDuplicates`), not the reset-upsert `queueStage`. Writing the concurrent-drain test exposed a real race. F07 moves a branch to `transcription`/`queued` a moment before it calls the launch, so a drain tick can backfill that same branch concurrently. With the reset upsert, the second writer would have bumped `run` to 2 and left a stale run-1 job behind. The reset upsert is kept for advancing into the next stage, which is where "re-run everything downstream" needs it.
- The worker is registered with `autorun: false` and started in `onApplicationBootstrap`. Otherwise it could take a job before `TranscriptionModule`'s `onModuleInit` has registered its handler. `@nestjs/bullmq` spreads decorator options into the `Worker` constructor, so this works.
- **A real shutdown bug, found by the existing `health.spec.ts`, not by a new test.** Its `stopping_redis_marks_it_down_without_hiding_the_others` test stops the Redis container. After that, `afterAll`'s `app.close()` hung for the whole 180 s hook timeout (all 185 tests passed; only the file failed). The cause: `@nestjs/bullmq`'s shutdown closes the worker and queue gracefully, and BullMQ's graceful close sends `QUIT` through ioredis. With `maxRetriesPerRequest: null`, which BullMQ requires, that command waits in the offline queue for a server that is gone. A production API shutting down during a Redis outage would hang the same way. Fixed in `beforeApplicationShutdown`: the worker closes with `force` (an in-flight job becomes stalled and is re-delivered on the next boot, which the run guard makes safe), and the queue disconnects. Both are bounded by `PIPELINE_SHUTDOWN_TIMEOUT_MS` (5 s). Verified: `health.spec.ts` alone went from a 180 s timeout to 18 s, green.
- **Also added, because BullMQ's documentation requires it:** `error` listeners on both the worker (`@OnWorkerEvent('error')`) and the queue. Without one, an emitted connection error can stop the worker from taking jobs. Both log at `warn`, since ioredis reconnects by itself.
- F07's `PipelineLaunchPort.launch` is now async and delegates to `PipelineService.launch`. `RecordingFinalizerService` awaits it before `markBranchLaunched`, and `RecordingModule` imports `PipelineModule`, which imports nothing of recording's, so there is no cycle. F07's finalization suite still overrides the port with a plain mock and passed unchanged (20/20).
- **Runtime check against the real stack:** the dev server rebooted cleanly with `PipelineModule` wired, and Redis shows the worker's connection (`bull:lesson-pipeline:stalled-check`, client `bull:bGVzc29uLXBpcGVsaW5l`). A scratch lesson (`room = 'f08-scratch'`) was inserted with a branch at `transcription`/`queued` and no stage row, which is the pre-F08 state. The drain's own 15 s interval created its `transcription` stage row (`queued`, run 1) and moved the pointer. It added **no** job, because no handler was registered yet, which is exactly the "ignores stages without a registered handler" rule. The scratch lesson is kept on purpose, to exercise the storage-unreadable path once stage 3 registers the handler. The dev server also restarted several times under `nest start --watch` during this stage, and each restart went through the new forced-shutdown hooks in seconds.
- Processor paths that need a real handler (claiming a run, retrying, blocking, failing, completing) are exercised end to end from stage 3 on.
- The stage-4 files already written (`pipeline.controller.ts`, `lesson-access.service.ts`) and the stage-3/5 files are not part of this commit. The controller was moved out of `src/` while this stage was validated, because it calls service methods stage 4 adds.

**Validation:** `pnpm --filter @english-quest/api typecheck` ✅ · `pnpm lint` ✅ · `vitest run test/unit` ✅ 145/145 (the 120 existing tests plus the 25 new unit tests already written for stage 5: client, response mapping, backoff, merge) · the 15 existing integration files ✅ 185/185 (including `recording-finalization.spec.ts` with the async launch, and `health.spec.ts` after the shutdown fix). The first full run of this stage showed the hang described above; it is recorded, not hidden.
**Commit:** `44ebb38` — F08 stage 2 - pipeline runner

## Stage 3: Azure transcription — ✅ done

- [x] **11. Fast transcription client**
- [x] **12. Response mapping and speech-to-text capability**
- [x] **13. Transcript writer**
- [x] **14. Transcription stage handler**

**Observations:**
- **A real bug in stage 2's committed runner, surfaced the first time a handler returned anything but success.** The processor passes the typed outcome error (`StageBlockedError` etc.) to `markBlocked`/`markFailed`/`markRetrying` as the "reason", and the state service spread it into the Prisma update. Spreading an `Error` instance also copies its enumerable `name` class field, and Prisma rejects the unknown `name` column. So every blocked, failed or retrying outcome threw inside the runner, and the row stayed `running`. 8 of the 15 transcription tests caught it. Fixed by copying exactly the three reason fields (`reasonFields`).
- **A second, related hazard found while checking the fix on the real stack.** Before the fix reached the dev server, the scratch lesson left by stage 2 (no audio object) ran **16 times**. Each attempt ended with the job `failed` and the row still `running`, and the drain replaced the job every 15 s. Harmless there, because there's no provider call without audio. But with real audio, *any* fault that keeps the runner from recording an outcome would spend the owner's Azure quota every 15 s, forever. **Deviation from the spec's drain rule (bounded now):** a pending row whose job is `failed` (or in an unknown state) while the row is mid-run (`running`/`retrying`) is now **failed as `internal_error`**, not re-run (`PipelineStateService.abandon`). The owner can still retry by hand. Only a `queued` row, or a job that is missing or `completed`, is re-added. `ensureJob` became `jobState` + `replaceJob`, so the drain can decide. New test: `a_stage_whose_job_died_mid_run_is_failed_not_rerun`.
- **Live check with the user's own Azure key (`TEST_AZURE_SPEECH_*`, region `eastus2`, an AI Services resource), through a throwaway script run from `apps/api` and deleted afterwards.** The sample was 17 s of speech synthesized locally with Windows' System.Speech and converted to Ogg/Opus 48 kbps with `ffmpeg-static`. TTS is fine here: it tests the endpoint and is not product content.
  - The **regional endpoint** `https://eastus2.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15` accepts the AI Services key: HTTP 200 in about 3 s for 17 s of audio, Ogg/Opus taken directly. This settles the spec's open risk about the regional host versus the resource's custom subdomain.
  - Raw response keys: `durationMilliseconds, combinedPhrases, phrases`. Phrase keys: `offsetMilliseconds, durationMilliseconds, text, words, locale, confidence`. **Word keys: `text, offsetMilliseconds, durationMilliseconds` only**, which confirms that the provider gives no per-word confidence.
  - **Finding that matters to F09: every phrase in the response carried the same confidence (0.826 for all four).** The documentation's own example shows the same pattern, with one value repeated across a run of phrases that changes only between groups. So "utterance confidence" is really a per-chunk figure. It barely separates utterances within a stretch of speech, and F09's plan to rank by lowest confidence first (as realigned in stage 1) will not discriminate the way its PRD rule intends. F08 stores what the provider returns, faithfully. **Recorded as an open follow-up for F09's spec**, which has to choose another selection signal or accept the coarse one.
  - A refused key gives a real HTTP 401 with Azure's sentence, which maps to `SpeechAuthRejectedError` with `status: 401` and the provider message intact.
- **End to end on the real local stack, with no fakes anywhere.** A scratch lesson was left exactly as F07's finalizer leaves one: `you@example.com`, who holds the user's own valid Azure key, and `partner@example.com`, who has no key. Each got the 17 s Ogg in local MinIO and a branch at `transcription`/`queued` with no stage row. The dev server's own drain picked both up within one tick:
  - `you` was transcribed with the user's key (`latency_ms` 2931; 4 utterances, 34 words). The stage went `completed` 3 s after it started, and the branch moved to `excerpt_selection`/`queued`.
  - `partner` became `blocked_missing_key` / `credential_missing` with no Azure call. `credential_usage` recorded `F08_lesson_transcription` as `ok` for `you` and `blocked` for `partner`, each under its own user.
- **Blocked → resume, timed on the real stack.** You can't save a real key through the settings screen here: the key would have to be typed, and entering API keys is off-limits for the agent. So a key rejection was simulated by flipping `you`'s stored Azure credential to `invalid` in SQL, with the ciphertext untouched. A new single-speaker scratch lesson then blocked with `credential_rejected`. Restoring the status to `valid` stands in for a successful save. The stage **left `blocked` 12 s later** (criterion: within 60 s) and completed at 15 s on run 2. The credential is back to exactly its original state (`valid`, same `last_validated_at`).
- `TranscriptionModule` is wired into `AppModule`. The handler registers itself with the registry in `onModuleInit`, before the worker starts at bootstrap.
- The stage 5 integration suites `transcription-pipeline.spec.ts`, `pipeline-drain.spec.ts` and `speech-to-text.spec.ts` (with `helpers/fake-speech.ts` and `helpers/pipeline-fixtures.ts`) were already written and are what validated this stage. They are committed with stage 5, per the plan.

**Validation:** `pnpm --filter @english-quest/api typecheck` ✅ · `pnpm lint` ✅ · `vitest run test/unit` ✅ 145/145 · integration ✅ 211/211 across 18 files: the 15 existing ones plus `transcription-pipeline` (15), `pipeline-drain` (8) and `speech-to-text` (3). The route suites wait for stage 4. The live Azure check and the real-stack end-to-end and resume checks are described above.
**Commit:** `bdaea4b` — F08 stage 3 - Azure transcription

## Stage 4: Routes and document — ✅ done

- [x] **15. Lesson access and pipeline routes**
- [x] **16. Transcript route**
- [x] **17. OpenAPI document**

**Observations:**
- `LessonAccessService` (in `pipeline/`, exported) is the shared participant check for the two new route families. It returns `CLASS004` for an unknown lesson and for a lesson the caller never joined. F07's `RecordingService` keeps its own copy; changing F07 was out of this stage's scope.
- The retry route rejects anything that is not the caller's current stage in `failed`. That includes `blocked_missing_key`, which resumes by itself: `PIPE001` carries `details: { stage, status }`, and `{ stage: null, status: null }` when there is no branch. A branch failed or `storage_unavailable` at `recording` gets `PIPE002` with `details.retryRoute`.
- The derived `recording` entry uses `lessons.started_at` → `recording_finalized_at` as its span and the branch's `launched_at` as its last attempt. It reads `running` while F07 is still verifying. F07's `storage_unavailable` shows as `failed` with reason code `storage_unavailable` and the sentence "Storage was unavailable when this recording was verified." That sentence is new copy, written here because F07 has only a status, not a sentence, for that state. Recorded so F19 can reword it if it wants.
- The transcript's speaker list is every participant with a branch plus the caller. A participant without a branch counts as `pending` while F07 is still finalizing, and `unavailable` afterwards. Blocked, queued, running, retrying and `storage_unavailable` all read `pending`, and any `failed` branch reads `unavailable`. No reason, code or provider is ever included.
- `RecordingService`'s view now types `failureCode` as the widened `BranchFailureCode`. Its `retryable` still only means F07's own retry, so a transcription failure reads `retryable: false` there, while `retryable: true` shows up on the pipeline view.
- `docs/api/openapi.json` regenerated: 22 operations, adding `GET /lessons/{lessonId}/pipeline`, `POST /lessons/{lessonId}/pipeline/retry` and `GET /lessons/{lessonId}/transcript`, plus the `LessonPipelineView` and `LessonTranscriptView` components and the `pipeline` and `transcript` tags.
- **Real-stack check of the three routes, on the running dev server, with bearer tokens for both seeded accounts,** against stage 3's live scratch lesson (`you` transcribed with the user's real key, `partner` blocked):
  - `you` sees `recording` completed, `transcription` completed and `excerpt_selection` queued. Speakers read `You` available and `Partner` pending. All 4 utterances are there, `you`'s own with `confidence` and `words`. The retry returns 409 `PIPE001` with `details {stage: excerpt_selection, status: queued}`.
  - `partner` sees their own `transcription` as `blocked_missing_key`, `credential_missing`, "Blocked — add your Azure Speech key to continue.", `blockedProvider: azure_speech`, not retryable. They get the same 4 utterances with **no** `confidence` or `words` keys (all `you`'s). The retry returns 409 `PIPE001` with `details {stage: transcription, status: blocked_missing_key}`.
  - The dev server log shows all three routes mapped.
- The two route suites (`pipeline-routes.spec.ts` 12, `transcript-routes.spec.ts` 8) were already written, and are what validated this stage. They're committed with stage 5.

**Validation:** `pnpm --filter @english-quest/api typecheck` ✅ · `pnpm lint` ✅ · `openapi:generate` (22 operations) ✅ · `vitest run test/unit` ✅ 145/145 (includes the committed-snapshot test on the regenerated document) · `vitest run test/integration` ✅ 231/231 across 20 files · real-stack route check (see above).
**Commit:** _(pending — recorded in the next stage)_

## Stage 5: Closing the loop — ⬜ pending

- [ ] **18. Test suites**
- [ ] **19. Live verification**
- [ ] **20. Follow-ups for neighbouring features**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_
