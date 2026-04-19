# Implementation Plan: F07. Background Processing Pipeline

**Prerequisites:**
- Node.js (matching the Next.js 16 / React 19 scaffold already in `package.json`)
- Docker Desktop running locally (reuses the Postgres container stood up by F02 for dev, and the testcontainers-based Postgres for integration tests)
- F02 and F03 merged (provide the `Video` table, `getSession()`, cookie helpers, Prisma singleton, ffmpeg/ffprobe wrappers, storage layout, and the integration test harness this feature extends)
- Runtime dependencies to add: `openai`, `pg` (low-level Postgres client for the LISTEN/NOTIFY bridge; `@prisma/client` does not expose LISTEN)
- Environment variables (via `.env.local`, copied from `.env.example`): `OPENAI_API_KEY`, `VIDEOMAX_PIPELINE_CONCURRENCY` (default `2`), `VIDEOMAX_PIPELINE_POLL_INTERVAL_MS` (default `2000`), `VIDEOMAX_PIPELINE_LEASE_TIMEOUT_MS` (default `900000`), `VIDEOMAX_PIPELINE_ENABLED` (default `1`), `WHISPER_MODEL` (default `whisper-1`), `SUMMARY_MODEL` (default `gpt-4.1-nano`), `SUMMARY_INPUT_MAX_CHARS` (default `120000`)
- OpenAI API key with access to Whisper and GPT-4.1 nano; integration tests default to the `OPENAI_FAKE=1` fake client and do not hit the network
- A writable `storage/videos/<userId>/<videoId>/` layout established by F03 (audio files produced by the validate stage live alongside the source video)
- The Vitest `integration` project with `testcontainers` bootstrap introduced by F02 and extended by F03; F07 adds a handful of new integration files into the same project

---

### Stage 1: Data Model, Queue Foundations, and Shared Infrastructure

**1. Pipeline data model and migration** - Extend `prisma/schema.prisma` with the five new models described in the spec's Data Model section (`VideoJob`, `Transcription`, `TranscriptionSegment`, `Summary`, `VideoEvent`) plus the reciprocal relations on the existing `Video` and `User` models, generate the `add_pipeline` migration that creates the five tables with their indexes, foreign keys, and CHECK constraints, installs the `notify_video_event()` trigger function and `tr_video_event_notify` trigger on `video_event` for LISTEN/NOTIFY, and backfills a `video_job` row for every pre-existing video still in `status = 'validating'` so the deploy is self-healing.

**2. Shared pipeline types and error taxonomy** - Introduce `app/_lib/pipeline/errors.ts` with the typed `PipelineError` class and the code enum used by every stage handler (`PIPE_VALIDATE_UNREADABLE`, `PIPE_VALIDATE_TOO_LONG`, `PIPE_TRANSCRIBE_API`, `PIPE_SUMMARIZE_API`, `PIPE_SUMMARIZE_MALFORMED`, `PIPE_TIMEOUT`, `PIPE_INTERNAL`), and `app/_lib/pipeline/backoff.ts` as the pure function that maps an attempt counter to the next `scheduled_at` (or null when the stage has exhausted its three attempts) so the retry schedule lives in exactly one place.

**3. Job queue accessors** - Introduce `app/_lib/pipeline/queue.ts` with the Prisma accessors the worker needs (`enqueuePipelineJob`, `claimDueJobs` using `SELECT ... FOR UPDATE SKIP LOCKED`, `completeJob`, `failJob`, `rescheduleJob`, `releaseStaleLeases`, `resetJobForRetry`) so every queue interaction is centralized, typed, and directly testable against the real Postgres container.

**4. Atomic status transitions and event log** - Introduce `app/_lib/pipeline/status.ts` that wraps the `video.status` update and the matching `video_event` insert in a single Prisma transaction, enforces the legal transition table (`validating → transcribing → summarizing → ready`, and `any → failed`, `failed → any stage entry`), and rejects disallowed transitions so drift between the status column and the event log is impossible.

**5. Environment bootstrap and Next.js configuration** - Extend `.env.example` with the eight new environment variables listed in the prerequisites, append `"openai"` to `serverExternalPackages` in `next.config.ts` so the SDK is not bundled into the client, and document the kill-switch semantics of `VIDEOMAX_PIPELINE_ENABLED` so CI can disable the worker without code changes.

### Stage 2: Stage Handlers, OpenAI Boundary, and Audio Extraction

**6. OpenAI client wrapper with fake toggle** - Introduce `app/_lib/pipeline/openai.ts` that centralizes OpenAI SDK construction, per-call timeouts (5 min for Whisper, 60 s for GPT-4.1 nano), the retriable-vs-fatal error mapping, and the `OPENAI_FAKE=1` switch that redirects every call to a deterministic fake module in tests; the wrapper exposes the two high-level operations the stages need (`transcribeAudio`, `summarizeText`) and nothing else.

**7. Audio track extraction** - Introduce `app/_lib/pipeline/audio.ts` that wraps `ffmpeg` (via the installer package F03 already depends on) to extract a mono Opus-at-32 kbps OGG track into the video's storage directory, mirroring F03's `probe.ts` style of timeouts and error-swallowing boundaries so the validate stage only has to decide success versus retriable failure.

**8. Validate stage handler** - Introduce `app/_lib/pipeline/stages/validate.ts` that re-probes the source's duration, enforces the 2-hour cap, rejects unreadable files with `PIPE_VALIDATE_UNREADABLE`, extracts the audio track via the audio module, and on success transitions the video to `transcribing` while advancing the `video_job` row to the `transcribe` stage; all side effects route through the queue and status modules.

**9. Transcribe stage handler** - Introduce `app/_lib/pipeline/stages/transcribe.ts` that calls the OpenAI wrapper against the extracted audio, persists the `Transcription` header row and every `TranscriptionSegment` in a single Prisma transaction (after idempotently deleting any prior transcription rows for this video), stores the detected language code, and transitions the video to `summarizing` while advancing the job row to the `summarize` stage.

**10. Summarize stage handler** - Introduce `app/_lib/pipeline/stages/summarize.ts` that loads the concatenated segment text, applies the middle-out truncation to `SUMMARY_INPUT_MAX_CHARS` when needed, calls the OpenAI wrapper with the fixed JSON-mode prompt, validates the returned shape (`overview` string + `key_topics` string array), persists the `Summary` row idempotently, transitions the video to `ready`, and calls `completeJob` so the `video_job` row is removed.

### Stage 3: Worker Loop, Real-Time Bridge, and Boot

**11. Pipeline worker loop** - Introduce `app/_lib/pipeline/worker.ts` as a long-lived polling loop that every `VIDEOMAX_PIPELINE_POLL_INTERVAL_MS` releases stale leases, claims up to `VIDEOMAX_PIPELINE_CONCURRENCY` due jobs via the queue module, dispatches each claimed job to the correct stage handler based on its `stage` column, applies retry/backoff via the queue and status modules on retriable failures, marks the video `failed` with its error code after three exhausted attempts, and logs a structured JSON line per transition so operators can grep stage timings.

**12. LISTEN/NOTIFY bridge and subscription helper** - Introduce `app/_lib/pipeline/events.ts` that opens a dedicated `pg` client connected to the same Postgres used by Prisma, issues `LISTEN video_events`, and exposes `subscribeToVideoEvents(videoId, signal)` as an async iterator the SSE endpoint and F11 will consume; include `startListener` / `stopListener` used by the bootstrap so exactly one Postgres LISTEN connection exists per Node process.

**13. Server bootstrap via instrumentation** - Introduce `app/_lib/pipeline/bootstrap.ts` with idempotent `start()` / `stop()` functions and a new root-level `instrumentation.ts` that dynamically imports the bootstrap module when `NEXT_RUNTIME === 'nodejs'` and `VIDEOMAX_PIPELINE_ENABLED !== '0'`, wires `stop()` into `process.on('beforeExit')` / `SIGTERM` / `SIGINT`, and guards against double-start under HMR so the worker survives dev reloads without spawning clones.

**14. Upload-path enqueue hook** - Modify `app/_lib/videos/upload.ts` to append a single `enqueuePipelineJob(video.id)` call at the successful return path (wrapped in a try/catch that logs but does not fail the upload, since the deploy backfill and the `video_job` UNIQUE constraint together make a missed enqueue self-healing) so every new F03 upload enters the pipeline without operator intervention.

### Stage 4: HTTP Surfaces and Retry Endpoint

**15. Retry Route Handler** - Introduce `app/api/videos/[id]/retry/route.ts` as a Node-runtime `POST` Route Handler that authenticates via `getSession()`, performs the ownership check, rejects any video not in `failed` state with a 409, calls `resetJobForRetry` on the queue module and `transitionStatus` to switch the video back to the failed stage's entry status with a fresh `attempt = 0`, and returns the new state as JSON so the UI can reflect the reset immediately.

**16. Status event SSE Route Handler** - Introduce `app/api/videos/[id]/events/route.ts` as a Node-runtime `GET` Route Handler that authenticates, performs the ownership check, opens the `subscribeToVideoEvents` iterator, translates every emitted event into the SSE wire format from the spec's API Contracts section, emits a keep-alive comment every 20 s, and closes cleanly when the client disconnects (listener unsubscribe, iterator cleanup) so the notification panel in F11 can consume it without extra plumbing.

**17. Video repository extension for retry and future consumers** - Modify `app/_lib/videos/repository.ts` to expose `getVideoWithPipelineRelations(videoId, userId)` so the retry Route Handler can load the video with its `video_job`, last event, and current stage in a single query, and so F08/F10 can later re-use the same accessor; the existing accessors are left untouched.

### Stage 5: Test Coverage

**18. Unit tests for every pipeline module** - Implement the unit tests listed in the spec's Testing Strategy for `backoff`, `errors`, `queue` (Prisma-doubled), `status` (Prisma-doubled), `openai` (fake module), `audio` (child-process stubs), the three stage handlers (with full mocks on OpenAI, audio, queue, status), and the worker poll loop (with a fake queue) so every branch — happy path, retriable failure, fatal failure, malformed JSON, lease expiry, legal/illegal transitions — is covered.

**19. Integration tests for the pipeline end-to-end and the HTTP surfaces** - Implement the integration tests listed in the spec against the `testcontainers` Postgres plus a `tmpdir` storage root and the `OPENAI_FAKE=1` client: the full queue lifecycle (including the `SKIP LOCKED` concurrency assertion using two raw `pg` clients), the atomic status/event transaction, the LISTEN/NOTIFY latency (< 1 s), the end-to-end worker driving a seeded video to `ready` (and through the retry-once-then-succeed and fail-after-three paths), the worker-crash simulation that advances time past the lease timeout to prove re-entry is safe, the validate stage's 2-hour rejection, the retry Route Handler's 200/401/404/409 branches, and the SSE endpoint's keep-alive + owner-filter + stream-transition assertions — satisfying every F07 Section 9 acceptance criterion and every Cross-Feature Integration criterion where F07 is the provider.
