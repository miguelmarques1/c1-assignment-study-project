# Implementation Progress: Live Classroom

**Status:** in progress — Stage 4 of 5 complete
**Branch:** main
**Started:** 2026-09-15
**Last updated:** 2026-09-16

## Stage 1: Infrastructure, contracts and data model — ✅ done

- [x] **1. LiveKit local configuration**
- [x] **2. Environment contract**
- [x] **3. Shared classroom contract**
- [x] **4. Lesson data model and migration**

**Observations:**
- `livekit.yaml`: replaced the `rtc.port_range_start/end` (50000-50100) range with a single muxed `rtc.udp_port: 7882`, per the spec's Docker-on-Windows rationale. Added the `webhook` block pointing at `http://api:3001/classroom/livekit-webhook` with `api_key: devkey` (matches the existing dev key pair).
- `docker-compose.yml`: publishes `7882/udp` (env-overridable via `LIVEKIT_UDP_PORT`) on the `livekit` service; recreated that one container to pick up the change (`docker compose up -d livekit`) rather than restarting the whole stack.
- `env.ts`: added `LIVEKIT_WS_URL` (required, no default — the container-internal `LIVEKIT_URL` is unreachable from a browser) and `LESSON_MAX_PARTICIPANTS` (int 2–4, default 2). Both added to `.env.example` and to the real local `.env` (gitignored, not committed).
- **Deviation:** `apps/api/test/integration/helpers/test-app.ts` needed `LIVEKIT_WS_URL: 'ws://localhost:7880'` added to its default test environment block, since it's now a required var with no default and every integration suite boots the full `AppModule`. Not in the original component overview but necessary for any integration test to run at all after this stage.
- **Deviation:** the partial unique index `ux_lessons_open_room` (`WHERE status IN ('waiting','live')`) is created by raw SQL in the migration only — Prisma's schema DSL has no partial-index syntax. Documented with a `///` comment directly on the `Lesson` model in `schema.prisma` warning that a future `prisma migrate dev` may propose dropping it, since Prisma's desired-state diffing doesn't see it. Whoever runs `migrate dev` next needs to reject that part of any generated migration by hand.
- `AppError.classroomFull(maxParticipants)` overrides the pinned `ERROR_MESSAGES[CLASSROOM_FULL]` with the live cap via the constructor's `message` param (no prior use of that param in the codebase, but it's the cleanest fit — the PRD's exact wording, `This classroom is full ({cap} participants).`, needs the configured value baked into the string itself, not just carried in `details` the way `AUTH_LOCKED_OUT`'s countdown is).
- Regenerated `docs/api/openapi.json` now (adds `CLASS001`–`CLASS004` to the error-code enum only — no new paths yet) rather than waiting for Stage 2's route work, because the committed-snapshot test (`openapi.spec.ts`) checks the full document on every run and would otherwise fail immediately as a Stage-1-attributable regression. It will be regenerated again once the classroom routes land in Stage 2/3, per the plan.
- Applied `0004_lessons` against the local Docker Postgres (`docker compose exec ... prisma migrate deploy`) and regenerated the Prisma client, to prove the SQL is valid before committing. On Windows/Git Bash, `docker compose exec -w <path>` needs `MSYS_NO_PATHCONV=1` or the path gets mangled — worth remembering for the remaining stages.
- Not yet started: `livekit-server-sdk` / `livekit-client` are not yet added as dependencies (Stage 2 step 5 / Stage 4 step 12); no classroom module, controller, service, or web code exists yet.

**Validation:** `pnpm --filter @english-quest/shared build` ✅ · `pnpm --filter @english-quest/api typecheck` ✅ · `pnpm --filter @english-quest/api test:unit` ✅ 85/85 (includes the OpenAPI committed-snapshot check and the new/extended `env.spec.ts` cases) · migration applied cleanly against local Postgres, Prisma client regenerated without error.
**Commit:** `97fb1dc` — F05 spec/plan and stage 1 - infrastructure, contracts and data model

## Stage 2: LiveKit access and the join path — ✅ done

- [x] **5. LiveKit service**
- [x] **6. Lesson read and write model**
- [x] **7. Join orchestration and the cap**
- [x] **8. Authenticated classroom routes**

**Observations:**
- Reconciled the two duplicate "Stage 2 — pending" blocks left by the prior run's context-budget pause into this single entry; no work had actually started on either, so nothing was lost.
- `livekit-server-sdk@^2` added to `apps/api/package.json` and installed (resolved `2.19.0`); `RoomServiceClient` used directly (per the spec's Component Overview wording) rather than the newer `LiveKitAPI` wrapper.
- **Deviation — participant-row write ownership resolved by design, not spec text alone:** the spec names `joined_at` as "this participant's own first connection" but also has the join-orchestration diagram (T6) upsert a `lesson_participants` row at *token issuance* time, before any WebRTC connection exists — and the webhook test table separately asserts `joined_at` is set "from the event timestamp" on a participant's first `participant_joined`. Reconciled as: `LessonService.registerParticipant` (called from the token route) creates the row idempotently with `joinedAt = now()` as a placeholder that is never touched again by that method; `LessonService.markConnected` (called from the webhook path in Stage 3) overwrites `joinedAt` with the event's own timestamp only on that participant's first-ever connection (detected via `lastConnectedAt` being null beforehand), and leaves it untouched on a reconnect. This satisfies both the "row exists right after token issuance" integration-test expectations and the webhook table's explicit "joined_at ... set from the event timestamp" wording.
- **Deviation — `lesson_participants.left_at`:** interpreted "set when the lesson finalizes, or on a final disconnect" as meaning finalization is the only server-observable "final" disconnect (a mid-lesson `participant_left` may always be a reconnect within the 30s web-side window, which the API has no way to distinguish from a permanent departure at the webhook layer). `markDisconnected` (Stage 3) therefore only touches `connected`/`last_disconnected_at`; `finalizeLesson` batch-sets `left_at` for every still-open participant row of that lesson. Recorded here since it affects both Stage 2's `LessonService.finalizeLesson` and Stage 3's lifecycle handlers.
- **Race safety:** two simultaneous first-token requests are handled by attempting a plain `lesson.create` and catching the `ux_lessons_open_room` unique-violation (Prisma `P2002`) — the loser re-reads and reuses the winner's row rather than retrying inside a transaction. Deliberately did **not** wrap the occupancy check (`listParticipants`, a network call to LiveKit) inside a Prisma transaction, since holding a DB transaction open across an external HTTP round trip is its own risk; instead, `ClassroomService.requestToken` tracks whether *this* request created the lesson row and issues a compensating `discardLesson` (hard delete) only in that case, when `listParticipants` throws CLASS002 — satisfying "no lesson row is committed" without a long-lived transaction.
- `LiveKitService.unavailable()` always returns the fixed reason string `'LiveKit server not reachable'` in `details.reason`, per the unit-test requirement (Stage 5) that the raw SDK error message is never leaked to the client.
- `AppError.notAParticipant()` is currently thrown both for "lesson doesn't exist" and "caller has no participant row" in `endLesson` — the spec defines no separate not-found code, and a nonexistent `lessonId` is indistinguishable from "not a participant" from the caller's point of view.
- Found and fixed a pre-existing-looking but actually self-inflicted gap: `@ApiParam({ name: 'lessonId', format: 'uuid' })` without an explicit `type` produced a schema that matched when generated via `tsx` (`openapi:generate`) but not when the *same* document was rebuilt in-process by `vitest` (`unplugin-swc` transpilation) — the two pipelines apparently differ in whether NestJS's swagger plugin backfills `type: 'string'` from the TS parameter type. Fixed by specifying `type: 'string'` explicitly on the decorator so generation no longer depends on which transpiler runs it. Worth remembering for any future `@ApiParam` that only specifies `format`.
- OpenAPI document regenerated (`pnpm --filter @english-quest/api openapi:generate`) after the three classroom routes landed, per the project's OpenAPI directive; 13 operations now documented (was 10).
- Runtime check (routes actually called over HTTP) deferred: no testcontainers integration suite exists yet for classroom (`apps/api/test/integration/classroom.spec.ts` is Stage 5, step 21 per the plan) and a full two-party manual join needs the LiveKit media stack up, which is Stage 5 step 22. Logged under Soft-fails below rather than claimed.

**Validation:** `pnpm --filter @english-quest/api typecheck` ✅ · `pnpm lint` ✅ · `pnpm --filter @english-quest/api test:unit` ✅ 85/85 (includes the OpenAPI committed-snapshot check) · **Soft-fail:** no classroom integration/runtime exercise yet — the routes have not been called over HTTP in this stage; deferred to Stage 5's test suites and manual verification, per the plan's own stage boundaries.
**Commit:** `ac90fbc` — F05 stage 2 - LiveKit access and the join path

## Stage 3: Lifecycle events and automatic closure — ✅ done

- [x] **9. Webhook transport**
- [x] **10. Lifecycle application**
- [x] **11. Auto-end sweeper**

**Observations:**
- `app.use('/classroom/livekit-webhook', raw({ type: 'application/webhook+json' }))` mounted in `main.ts` right after `cookieParser`, per the spec's Technical Decisions table (explicit `express.raw` middleware, not Nest's `rawBody: true`, since Nest's built-in parsers never match LiveKit's content type either way).
- **Deviation:** `express` added as a direct dependency of `apps/api` (`^5`, matching the version `@nestjs/platform-express` already resolves) — it was only a transitive dependency before, and this project's pnpm setup has no hoisting/shamefully-hoist config, so `import { raw } from 'express'` needs it declared explicitly, the same reason `cookie-parser` is already a direct dependency rather than relying on Nest's own use of it.
- **Deviation:** `apps/api/test/integration/helpers/test-app.ts` needed the identical `raw()` middleware mounted (mirroring `main.ts`) — otherwise every integration test that exercises the webhook route (Stage 5) would receive an already-consumed or JSON-parsed body instead of the raw bytes the signature is computed over.
- **Deviation:** `apps/api/test/unit/openapi.spec.ts`'s `protected_routes_declare_a_session_transport` guard hardcodes an allowlist of public operations; added `'post /classroom/livekit-webhook'` to it, since that route is genuinely public (authenticated by LiveKit's signature, never by session) and the guard doesn't consult the `@Public()` decorator itself.
- `LessonLifecycleService` treats `event.createdAt` (LiveKit's own event timestamp, seconds since epoch) as "the event time" uniformly for `started_at`, `lesson_participants.joined_at` on first connection, and every disconnect timestamp — matches the spec's explicit requirement that `started_at` come from the webhook event's own `createdAt`, not the API's receipt time.
- `markConnected`'s first-connection detection (joined at token-issuance time vs. overwritten by the first real `participant_joined`) is exercised here for the first time — see Stage 2's observations for the full reasoning; Stage 3 is where it actually gets called.
- Sweeper (`LessonLifecycleJob`) queries every non-terminal lesson once per tick (`findSweepable`) rather than three targeted queries — the partial unique index caps this at one row per room, and the MVP has one room, so there is never more than one candidate row to evaluate regardless of query shape.
- `deleteRoom` is called from the sweeper for the `all_disconnected` and `max_duration` endings (wrapped in try/catch — the room may already be gone via LiveKit's own empty-room timeout, which must not abort the sweep), but not for `abandoned_before_start`: a lesson that never started has the least urgency to force-close a room that likely has nobody in it. The spec's own test table only asserts `deleteRoom` explicitly for the 120-minute cap case; this doesn't conflict with it either way for the other two.
- Runtime check still deferred to Stage 5 for the same reason as Stage 2 — no webhook has actually been signed and POSTed against a running process in this stage. Logged under Soft-fails.

**Validation:** `pnpm --filter @english-quest/api typecheck` ✅ · `pnpm lint` ✅ · `pnpm --filter @english-quest/api test:unit` ✅ 85/85 (includes the updated OpenAPI committed-snapshot and security-transport guards; 14 operations now documented) · **Soft-fail:** no live webhook POST or sweeper tick exercised against a running process yet — deferred to Stage 5.
**Commit:** `3135614` — F05 stage 3 - lifecycle events and automatic closure

## Stage 4: The classroom screen — ✅ done

- [x] **12. Web API client and icons**
- [x] **13. Device preview and level meter**
- [x] **14. Room state hook**
- [x] **15. Participant tiles and layout**
- [x] **16. Classroom chrome**
- [x] **17. Waiting state and screen orchestration**
- [x] **18. Classroom route**

**Observations:**
- `livekit-client@^2` added to `apps/web` (resolved via `pnpm install`); wrapped in `useClassroomRoom` (participants, track publications, mute state, per-participant `ConnectionQuality`, reconnection phase) and `useMediaPreview` (pre-join device acquisition, switching, an `AnalyserNode`-driven level meter), kept as two separate hooks with two separate local-track lifecycles — the preview's tracks are stopped (`preview.release()`) once `connect()` succeeds, and the live call gets its own tracks via `room.localParticipant.setMicrophoneEnabled/setCameraEnabled` rather than the hook handing off its preview `LocalTrack` objects, which avoids track-ownership hand-off bugs at the cost of one extra `getUserMedia` prompt-free re-acquisition on join.
- Requests the microphone and the camera as **two separate** `createLocalTracks` calls in `useMediaPreview`, not one combined `{ audio: true, video: true }` call — a combined call fails both together on a single denial, which would make "denying the camera starts audio-only" (an AC) unimplementable. Classified per-device via `MediaDeviceFailure.getFailure`.
- **Deviation — token refresh mechanism:** `livekit-client` has no public API to hot-swap an active connection's token; the SDK's own documented pattern (confirmed via the library's docs) is `await room.disconnect(); await room.connect(url, newToken)`. Implemented that in `useClassroomRoom`'s 5-hour timer, guarded by a `refreshing` ref so the deliberate reconnect doesn't trip the same `Reconnecting`/`Disconnected` handlers a real network drop uses — otherwise a scheduled refresh would incorrectly show the reconnecting overlay or end the call. **Not exercised against a real LiveKit server in this stage** (would require a call already live for 5 hours) — flagged under Soft-fails; Stage 5's `classroom-room.spec.tsx` test (fake timers, fake `Room`) is what actually proves this path per the spec's own testing strategy.
- **Deviation:** the design system's `token-resolution.spec.ts` guard does not resolve Tailwind opacity-modifier syntax (`bg-outline-strong/60`) against a declared color token — it only matches the bare role name. Replaced every translucent overlay (dialog backdrop, reconnecting overlay, the name/quality pill backgrounds) with the solid token color instead of introducing a raw value or extending the guard; the mockup's "hard offset shadow, no soft translucency" visual language made this a natural fit rather than a compromise.
- No dialog/modal primitive exists yet in `components/ui` (checked — only `Card`, no `Dialog`). Built `EndLessonDialog` and `ReconnectingOverlay` as local, non-primitive markup composed from the same border/radius/shadow token classes `Card` itself uses, rather than reusing `Card` directly — `Card` hardcodes `shadow-card` in its own class list and `cn()` here is a plain concatenator (no tailwind-merge), so passing `shadow-modal` as an override would leave both classes present with an unpredictable winner. Confirmed `--shadow-modal` already exists in the generated token CSS, unused until now — this is likely what it was reserved for.
- `Badge`'s `children` prop is typed `string` (checked `badge.tsx`) — the mute badge is text-only (`Muted`), no icon composed inside it; satisfies "never colour alone" without needing to fight the type.
- `ParticipantGrid`: the local tile is always the small floating inset (never a grid cell) — at the default two-participant cap that reads as "two tiles" (one large remote, one small local); above the cap, remotes form a uniform 2-column grid with the same inset local tile over it. This one rule produces both tested layouts without a cap-specific branch.
- The in-call "device settings" toggle (Full Scope addition) reuses `preview.devices`/`preview.selectDevice` for its device lists and switching rather than adding a second device-enumeration path — device labels/ids don't depend on connection state, only the preview *tracks* do.
- Dashboard hero (`classroom-hero.tsx`) and the design-reference completeness flip are Stage 5's own steps (19-20 in the plan) — not touched here; `design/README.md`'s hero row is still `deferred` and `design-reference.spec.ts` still passes unchanged for that reason.
- Runtime check: `pnpm --filter @english-quest/web build` (a real Next.js production build, not just `tsc --noEmit`) compiles clean and statically confirms `/classroom` is a server-rendered dynamic route with its session-gated layout — this is real signal beyond typecheck, but it is still not a live LiveKit connection. No browser has actually requested camera/microphone access or joined a room against a running LiveKit server in this stage; that needs Stage 5's manual two-browser verification. Logged under Soft-fails.

**Validation:** `pnpm --filter @english-quest/web typecheck` ✅ · `pnpm lint` ✅ (repo-wide) · `pnpm --filter @english-quest/web test` ✅ 76/76 (existing suite — includes the token-resolution and design-reference guards; no classroom-specific tests exist yet, that's Stage 5) · `pnpm --filter @english-quest/web build` ✅ production build, `/classroom` route present · **Soft-fail:** no real LiveKit connection exercised (device permissions, join, reconnection, token refresh) — deferred to Stage 5's `classroom-*.spec.tsx` suites and the manual two-browser checklist.
**Commit:** _(recorded in the next stage's commit)_

## Stage 3: Lifecycle events and automatic closure — ⬜ pending

- [ ] **9. Webhook transport**
- [ ] **10. Lifecycle application**
- [ ] **11. Auto-end sweeper**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 4: The classroom screen — ⬜ pending

- [ ] **12. Web API client and icons**
- [ ] **13. Device preview and level meter**
- [ ] **14. Room state hook**
- [ ] **15. Participant tiles and layout**
- [ ] **16. Classroom chrome**
- [ ] **17. Waiting state and screen orchestration**
- [ ] **18. Classroom route**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 5: Dashboard entry and closing the loop — ⬜ pending

- [ ] **19. Dashboard hero**
- [ ] **20. Design reference update**
- [ ] **21. Test suites**
- [ ] **22. Manual verification**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_
