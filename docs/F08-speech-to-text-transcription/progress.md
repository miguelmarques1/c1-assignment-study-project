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
**Commit:** _(pending — recorded in the next stage)_

## Stage 3: Azure transcription — ⬜ pending

- [ ] **11. Fast transcription client**
- [ ] **12. Response mapping and speech-to-text capability**
- [ ] **13. Transcript writer**
- [ ] **14. Transcription stage handler**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 4: Routes and document — ⬜ pending

- [ ] **15. Lesson access and pipeline routes**
- [ ] **16. Transcript route**
- [ ] **17. OpenAPI document**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 5: Closing the loop — ⬜ pending

- [ ] **18. Test suites**
- [ ] **19. Live verification**
- [ ] **20. Follow-ups for neighbouring features**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_
