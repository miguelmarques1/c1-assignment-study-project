# Implementation Progress: Live Classroom

**Status:** in progress — paused after Stage 1 (context budget)
**Branch:** main
**Started:** 2026-09-15
**Last updated:** 2026-09-15

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
**Commit:** _(pending — see note below)_

## Stage 2: LiveKit access and the join path — ⬜ pending (not started)

- [ ] **5. LiveKit service**
- [ ] **6. Lesson read and write model**
- [ ] **7. Join orchestration and the cap**
- [ ] **8. Authenticated classroom routes**

**Observations:** Not started. `livekit-server-sdk@^2` confirmed available on the registry (`npm view` → `2.19.0`) but not yet installed. Next step: add the dependency, build `LiveKitService` wrapping `AccessToken`, `RoomServiceClient`'s `createRoom`/`listParticipants`/`deleteRoom`, and `WebhookReceiver`, translating transport failures into `AppError.classroomUnavailable(reason)` per the spec's Technical Decisions table.

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 2: LiveKit access and the join path — ⬜ pending

- [ ] **5. LiveKit service**
- [ ] **6. Lesson read and write model**
- [ ] **7. Join orchestration and the cap**
- [ ] **8. Authenticated classroom routes**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

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
