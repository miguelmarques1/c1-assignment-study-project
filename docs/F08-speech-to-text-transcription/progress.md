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
**Commit:** _(pending — recorded in the next stage)_

## Stage 2: Pipeline runner — ⬜ pending

- [ ] **6. Stage handler contract and registry**
- [ ] **7. Pipeline state service**
- [ ] **8. Queue and processor**
- [ ] **9. Drain and resume job**
- [ ] **10. Launch from recording**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

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
