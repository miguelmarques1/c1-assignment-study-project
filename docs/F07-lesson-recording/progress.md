# Implementation Progress: Lesson Recording

**Status:** in progress
**Branch:** main
**Started:** 2026-09-23
**Last updated:** 2026-09-23

## Stage 1: Infrastructure, contracts and data model — ✅ done

- [x] **1. Egress in the local stack**
- [x] **2. Environment contract**
- [x] **3. Shared recording contract**
- [x] **4. Recording data model and migration**

**Observations:**
- `egress.yaml` carries no `storage.s3` block, per the spec's decision: the API passes S3 upload credentials per egress request, so there is exactly one place object-store credentials live.
- `livekit.yaml` and `egress.yaml` both point at Redis database `1`, separate from the application's own database `0` (sessions, login throttling).
- Both `livekit` and the new `egress` service publish their health checks; `egress` uses the same `wget --spider` pattern the other services already use, and it worked — the image ships `wget`.
- **Deviation:** `EGRESS_S3_ENDPOINT` is documented in `.env.example` and the environment contract, but left unset in `docker-compose.yml`'s `api` environment block — its fallback (`S3_ENDPOINT`) is already the correct address in Docker, so setting it explicitly would just repeat the same value at a second call site.
- A published `LIVEKIT_EGRESS_HEALTH_PORT` (default 8080) was added to `docker-compose.yml`, matching the existing pattern of every other service publishing its management port to the host — not explicitly named in the spec's component table but consistent with it and needed for `curl`/manual checks.
- **Deviation — `lesson.service.ts`'s `projectSession`:** the spec assigns "live recording in the session read" to Stage 3 (step 11, once `RecordingStateService` exists to compute a caller's captured seconds from segments). Adding the shared contract's now-required `recording` field to `classroomSessionSchema` in this stage would otherwise break the API's typecheck immediately. Filled it now with what is honestly true at this point in the build: `status`/`since` read the real (currently always-default) `lessons.recordingStatus`/`recordingStartedAt` columns from the migration in this same stage, and `mine` is `{ status: 'not_started', capturedSeconds: 0 }` — correct because no segment exists until Stage 3's orchestrator writes one. Stage 3 replaces `mine` with a real per-caller projection; `status`/`since` do not need to change.
- Fixed one pre-existing test fixture (`apps/web/test/classroom-hero.spec.tsx`) that constructed a `ClassroomSession` object missing the new required `recording` field.
- `docs/api/openapi.json` regenerated now (adds `REC001`/`REC002` to the error-code enum, `egress` to the health dependency enum, and the `recording` object to `ClassroomSession` — no new paths yet), because the committed-snapshot test (`openapi.spec.ts`) checks the full document on every run and the shared-contract change alone was enough to make it stale. It will be regenerated again once the recording routes land in Stage 4.
- Prisma migration `0007_lesson_recording` applied cleanly against the local Postgres from a live database already carrying F01–F06's data (0001–0006), on both host and container; Prisma client regenerated in both places.
- Followed the project's established pattern for partial indexes Prisma's schema DSL cannot express (`ux_lessons_open_room`'s precedent): `ix_lessons_recording_pending` and `ux_segments_open_track` are created by raw SQL only and documented with a `///` comment on their model, not declared as `@@index`/`@@unique`, so a future `prisma migrate dev` does not propose dropping them.
- Added `user` relations on `LessonRecordingSegment` and `LessonPipelineBranch` (and the corresponding back-relation arrays on `User`) to match the established per-user-table pattern (`CredentialUsage`, `LessonParticipant`, `LessonRoleCard`), even though the spec's table only listed the FK, not the Prisma relation shape explicitly.
- **Runtime check:** with the API dev server running in the container (recreated to pick up `LIVEKIT_EGRESS_HEALTH_URL`) and the whole stack recreated where needed (`livekit` force-recreated to load its new `redis` block), logged in as `you@example.com`, requested a real classroom token, and confirmed `GET /classroom/session` returns the new `recording` block (`{"status":"idle","since":null,"mine":{"status":"not_started","capturedSeconds":0}}`) — then ended the lesson to leave the room clear for later stages. Confirmed the egress container's health port answers 200 from the host. `/health` still reports its four original dependencies unchanged (the `egress` entry is Stage 4's own step).

**Validation:** `pnpm --filter @english-quest/shared build` ✅ · `pnpm -r typecheck` ✅ · `pnpm lint` ✅ · `pnpm --filter @english-quest/api test:unit` ✅ 101/101 (includes the updated OpenAPI committed-snapshot) · `pnpm --filter @english-quest/api test:integration` ✅ 135/135 across 11 files (Testcontainers Postgres/Redis, migrations 0001–0007 applied fresh) · `pnpm --filter @english-quest/web test` ✅ 116/116 · migration `0007_lesson_recording` applied to local Postgres, Prisma client regenerated on host and in container · real-stack smoke check (see above).
**Commit:** `d83c12b` — F07 spec/plan and stage 1 - infrastructure, contracts and data model

## Stage 2: Storage, egress and assembly adapters — ✅ done

- [x] **5. Storage adapter extension**
- [x] **6. Egress client**
- [x] **7. Audio assembler**

**Observations:**
- `StorageService.statObject` distinguishes a missing object (`null`) from an unreachable store (thrown `StorageUnavailableError`) by checking the S3 SDK error's `name === 'NotFound'` or `$metadata.httpStatusCode === 404`; anything else is treated as unavailable. `objectExists` is left untouched (still collapses every failure to `false`) since nothing yet depends on changing its behavior and the spec's assumption explicitly contrasts the two rather than asking for one to replace the other.
- `uploadFile`/`downloadToFile` buffer through `fs/promises` rather than streaming — a **deviation** from the plan step's "stream files up and down" wording, recorded here: every current caller uploads or downloads an assembled lesson recording, bounded by the 120-minute lesson cap (well under 50 MB at F07's mono 48 kbps Opus), so this matches `getObject`/`putObject`'s own already-buffered style rather than adding chunked-upload machinery (S3 multipart, content-length negotiation) for a file size that never needs it.
- `deleteObjects` uses a single `DeleteObjectsCommand` rather than looping `deleteObject`, matching the plan's "delete in bulk" wording; a no-op guard on an empty array avoids S3's own rejection of a zero-object delete request.
- `EgressService` mirrors `LiveKitService`'s own discipline: every call wrapped, every transport failure translated into a typed `EgressUnavailableError` that never leaks the raw SDK message. `DirectFileOutput`'s `disableManifest: true` matters beyond tidiness — egress otherwise uploads a `.json` manifest alongside the media file, which would break the finalization criterion "every object under this lesson is audio".
- **Found and fixed a genuine bug while manually exercising `AudioAssembler` (not just a test bug):** the first version relied on `-t <duration>` as an output option to force the assembled file's length, on the assumption it would pad a short mix the way it trims a long one. It does not — `ffmpeg -t` only trims; `amix` stops emitting the moment its longest *input* stream ends, so a segment whose own decoded audio is shorter than its declared wall-clock span (the exact case F07 exists to handle — a mute near the end of a segment) silently truncated the whole output instead of being silence-padded. Fixed by adding `apad=whole_dur=<seconds>` on the mixed stream before the final `-t` safety trim. Caught by generating two synthetic Opus tones with `ffmpeg`'s own `sine` source and running the real `AudioAssembler` class against them via `tsx` (not a reimplementation) with three cases — a real inter-segment gap, an intra-segment shortfall, and a single segment — then reading back each output's per-second volume levels (`-af volumedetect` over narrow `-ss/-to` windows) to confirm tone/silence placement and duration, not just trusting the reported `durationMs`. Also confirmed `amix`'s `normalize=0` avoids the volume attenuation `amix` applies by default (would have quietly halved loudness per extra segment, since segments never overlap and summing them is exactly concatenation, not simultaneous mixing).
- Manually exercised `EgressService`'s real request shape against the running `egress`/`livekit` containers (a fake track id against a real, then a nonexistent, room) — confirmed the server accepts the `DirectFileOutput`/`S3Upload` construction (a specific, meaningful LiveKit error — "requested room does not exist" — rather than a malformed-request rejection) and that a failed/incomplete egress leaves no stray object or manifest in MinIO. Full success (a real published track actually uploading a segment) needs Stage 3's live wiring plus a real WebRTC call, which this environment cannot run standalone; recorded as the natural continuation, not a soft-fail of Stage 2's own scope.
- `ffmpeg-static` added as a direct dependency of `apps/api`; resolves and runs correctly on the host (Windows) — the container install is deferred to whichever stage next runs `docker compose exec api pnpm install`, since nothing in Stage 2 runs inside the container yet.
- No new automated test files in this stage — `storage.spec.ts`, `egress.service.spec.ts` and `audio-assembler.spec.ts` are explicitly Stage 5's own step (21) per the plan, matching F05/F06's precedent of a dedicated late test-suite stage. Stage 2's manual exercises above are a substitute for "actually run it" now, not for the formal suites later.

**Validation:** `pnpm -r typecheck` ✅ · `pnpm lint` ✅ · `pnpm --filter @english-quest/api test:unit` ✅ 101/101 (no regressions; no new tests yet) · manual exercise of `StorageService`'s new methods against real MinIO (round trip, stat hit/miss, unavailable-store distinction, upload/download, bulk delete, idempotent `ensureBucket`) ✅ · manual exercise of `AudioAssembler` against real `ffmpeg-static` and synthetic Opus fixtures (gap, intra-segment shortfall, single segment), verified by decoded duration and per-window volume, not just the reported value ✅ · manual exercise of `EgressService`'s request shape against the real `egress`/`livekit` containers ✅.
**Commit:** _(pending)_

## Stage 3: Recording during the lesson — ⬜ pending

- [ ] **8. Recording state service**
- [ ] **9. Egress orchestration**
- [ ] **10. Webhook and lifecycle wiring**
- [ ] **11. Live recording in the session read**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 4: Finalization and hand-off — ⬜ pending

- [ ] **12. Classification rules**
- [ ] **13. Finalization job**
- [ ] **14. Pipeline and fallback seams**
- [ ] **15. Recording routes and document**
- [ ] **16. Health probe**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 5: Classroom surfaces and closing the loop — ⬜ pending

- [ ] **17. Web recording client and signals**
- [ ] **18. Recording indicator and banner**
- [ ] **19. End dialog line and cap notice**
- [ ] **20. Design reference update**
- [ ] **21. Test suites**
- [ ] **22. Manual verification**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_
