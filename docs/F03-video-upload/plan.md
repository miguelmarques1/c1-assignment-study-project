# Implementation Plan: F03. Video Upload

**Prerequisites:**
- Node.js (matching the Next.js 16 / React 19 scaffold already in `package.json`)
- Docker Desktop running locally (reuses the Postgres container stood up by F02 for dev, and the testcontainers-based Postgres for integration tests)
- F02 merged (provides `getSession()`, the `User` table, Prisma client singleton, cookie helpers, and the integration test harness this feature extends)
- Runtime dependencies to add: `@ffprobe-installer/ffprobe`, `@ffmpeg-installer/ffmpeg`
- Environment variables (via `.env.local`, copied from `.env.example`): `VIDEO_STORAGE_ROOT` (defaulted in `.env.example`), `VIDEO_MAX_BYTES` (defaulted)
- Local filesystem writable under the project's `storage/` directory (gitignored by this feature)
- Vitest integration project and testcontainers bootstrap already in place from F02

---

### Stage 1: Storage, Data Model, and Shared Foundations

**1. Video table schema and migration** - Extend `prisma/schema.prisma` with the `Video` model described in the spec's Data Model section and the reciprocal relation on the existing `User` model, then generate the `add_video` migration that creates the `video` table with its indexes, foreign key, and CHECK constraints so every downstream feature (F04 Library, F07 Pipeline, F12 Admin) has a stable persistence layer from day one.

**2. Shared status, constants, and error types** - Introduce `app/_lib/videos/status.ts`, `app/_lib/videos/constants.ts`, and `app/_lib/videos/errors.ts` so the set of allowed statuses, extensions, MIME types, the size limit, the storage root resolver, and the typed upload-error codes live in one place and can be imported by every part of F03 (and by F04/F07 later) without duplication.

**3. Filesystem storage module** - Introduce `app/_lib/videos/storage.ts` with helpers that resolve per-user, per-video paths under the storage root, ensure directories exist, stream incoming bytes into a temp file with a hard byte-count guard, promote the temp file to its final path, and expose the thumbnail read stream consumed by the Route Handler — all with path-traversal protection so a malicious filename cannot escape the root.

**4. Probe and thumbnail module** - Introduce `app/_lib/videos/probe.ts` that wraps the installed `ffprobe` and `ffmpeg` binaries behind timeouts and error-swallowing boundaries, exposing a duration probe and a thumbnail-extraction function that each return a neutral "null / false" result when the external process misbehaves, isolating the upload orchestrator from process-spawning concerns.

**5. Video repository** - Introduce `app/_lib/videos/repository.ts` with thin Prisma accessors for creating the initial video row, setting the duration, setting the thumbnail path, finding a video for an owner, and deleting a video completely; F04 and F12 will later re-use these without touching Prisma directly.

**6. Environment, gitignore, and placeholder asset** - Add the two new environment variables to `.env.example`, add `/storage/` to `.gitignore`, and drop a `placeholder-thumbnail.jpg` asset under `public/` so the thumbnail Route Handler's fallback redirect resolves to a real file.

### Stage 2: Upload Orchestration and HTTP Endpoints

**7. Upload orchestrator** - Introduce `app/_lib/videos/upload.ts` that ties together authn, validation, the storage module, the Prisma transaction, and the probe module so a single `uploadVideo()` call handles validation, streams the body to disk, inserts the row with `status = 'validating'`, moves the file to its final path, probes duration, extracts the thumbnail, and compensates on failure exactly as described in the spec's Architecture Impact and Technical Decisions sections.

**8. Upload Route Handler** - Introduce `app/api/videos/route.ts` as a Node-runtime Route Handler for `POST /api/videos` that reads the session cookie, validates the `name` and `size` query parameters plus the `Content-Type` and `Content-Length` headers against the shared constants, delegates to the orchestrator, and maps typed errors to the HTTP status codes listed in the spec's API Contracts.

**9. Thumbnail Route Handler** - Introduce `app/api/videos/[id]/thumbnail/route.ts` as a Node-runtime Route Handler that authenticates and ownership-checks the request, returns a 404 (not 401) for any unauthenticated or non-owner case per the codebase's F12-aligned disclosure policy, streams the JPEG bytes with a private cache header when the thumbnail exists, and 307-redirects to the placeholder when it doesn't.

### Stage 3: Client Upload Experience

**10. Client validation and transport** - Introduce `app/_lib/videos/clientValidation.ts` that mirrors the server's extension and size rules so the UI can reject bad files before any bytes leave the browser, and `app/_lib/videos/uploadClient.ts` that performs the actual transfer via `XMLHttpRequest` so upload progress events are surfaced to the UI and typed error codes propagate back from the server.

**11. Upload queue and hook** - Introduce `app/_lib/videos/uploadQueue.ts` as a framework-free module-singleton queue that serializes uploads one at a time, survives route navigation, and emits snapshots on every state change, plus `app/_components/upload/useUploadQueue.ts` that exposes the snapshot to React via `useSyncExternalStore` and the queue's actions to the UI.

**12. Upload UI components and library embedding** - Introduce the three client components — `UploadDropZone`, `UploadProgressList`, and `UploadProgressCard` — that together implement the drag-and-drop zone, the file picker fallback, the queued/uploading/done/failed card states, and the cancel/retry affordances, then embed the drop zone and progress list into `app/app/page.tsx` so the authenticated shell from F02 becomes a functional upload surface.

### Stage 4: Test Coverage

**13. Unit tests across the shared modules and client surface** - Implement the unit tests listed in the spec's Testing Strategy for the status enum, the constants, client-side validation, the filesystem storage guards, the probe wrapper (with child-process stubs plus one real-binary smoke test against a committed fixture), the upload queue, the upload client transport, and both UI components, covering every branch each module exposes.

**14. Integration tests for the orchestrator and both Route Handlers** - Implement the integration tests listed in the spec for `uploadVideo`, `POST /api/videos`, and `GET /api/videos/[id]/thumbnail`, each running against a throwaway Postgres via the F02 testcontainers harness plus a throwaway storage root under `os.tmpdir()`, verifying every PRD Section 9 acceptance criterion for F03 and every Cross-Feature Integration criterion where F03 is the provider (DTO shape consumed by F04, `status = 'validating'` and status index consumed by F07, file-on-disk path consumed by F08, cascade FK consumed by F12).
