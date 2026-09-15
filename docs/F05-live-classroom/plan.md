# Implementation Plan: Live Classroom

**Prerequisites:**
- F01 (infrastructure, session authentication, health) and F21 (tokens, primitives, page states) implemented — both are in place
- New API dependency: `livekit-server-sdk` (^2)
- New web dependency: `livekit-client` (^2)
- New environment variables: `LESSON_MAX_PARTICIPANTS` (default 2, supported to 4) and `LIVEKIT_WS_URL` (browser-reachable WebSocket URL), added to `.env.example` and to the Zod contract in `apps/api/src/config/env.ts`
- Existing `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`, which must keep matching the key pair in `livekit.yaml`
- `livekit.yaml` and `docker-compose.yml` are modified by this feature; the stack must be restarted for the webhook and UDP changes to take effect
- `docs/api/openapi.json` is regenerated after the routes land, per the project's OpenAPI directive

---

### Stage 1: Infrastructure, contracts and data model

**1. LiveKit local configuration** - Configure the LiveKit server to deliver lifecycle webhooks to the API and to carry real media through Docker. Restart the stack and confirm from the container logs that webhook delivery is configured and that the health probe still reports LiveKit up.

**2. Environment contract** - Extend the environment schema with the participant cap and the browser-reachable LiveKit URL, both validated at boot with the same fail-loudly wording the existing variables use, and document them in the environment template.

**3. Shared classroom contract** - Add the classroom schemas and types to the shared package so both the API and the web client read one definition of a lesson status, a session projection and a token response. Register the new classroom error codes alongside the existing vocabulary.

**4. Lesson data model and migration** - Add the lesson and lesson-participant models to the Prisma schema and write the migration, including the partial unique index that keeps one lesson open per room and the lookup indexes F07 and F19 will read through. See the spec for columns, constraints and index definitions.

### Stage 2: LiveKit access and the join path

**5. LiveKit service** - Introduce the single module that talks to the LiveKit server SDK — token issuance, room creation, participant listing and room deletion — translating every transport failure into the project's typed error rather than letting an SDK error reach a controller.

**6. Lesson read and write model** - Build the service that opens a lesson, upserts participants, projects the current session for the client and finalizes a lesson with a reason and a duration. This is the surface F06 and F07 will consume, so it owns every write to the two new tables.

**7. Join orchestration and the cap** - Implement the service path behind the token request: resolve or open the lesson, check live occupancy against the configured cap before anything is issued, ensure the room exists, record the participant and hand back a token. See the spec for the ordering and for what must not be committed when LiveKit is unreachable.

**8. Authenticated classroom routes** - Expose the token request, the open-session read and the explicit end action, each with its OpenAPI decorators, its error responses and the validation the project applies to path parameters. Register the new components in the OpenAPI document and regenerate the committed specification.

### Stage 3: Lifecycle events and automatic closure

**9. Webhook transport** - Mount the raw-body middleware the signature check requires and expose the public webhook route that verifies LiveKit's signature before anything is read, answering unauthorized on any verification failure without touching state.

**10. Lifecycle application** - Apply the join, leave and room-finished events to the lesson and participant rows, including the rule that decides when a lesson has started and the tracking that records when nobody is connected any more. Every handler must be safe to run twice on the same event.

**11. Auto-end sweeper** - Add the scheduled job that closes lessons abandoned before they started, lessons whose participants have all been gone past the grace period, and lessons that have reached the maximum duration, following the same job pattern the credential re-validation already uses.

### Stage 4: The classroom screen

**12. Web API client and icons** - Add the browser-side calls for the three classroom routes, typed against the shared contract, and extend the icon set with the microphone, camera, hang-up, signal and verified marks, registering them in the design-system documentation page.

**13. Device preview and level meter** - Build the pre-join surface: local track creation, device enumeration and switching for microphone, camera and speaker, and a live input level meter. Permission failures have to be distinguishable per device, because denying the camera and denying the microphone lead to different outcomes.

**14. Room state hook** - Wrap the LiveKit client room in the hook the screen reads from: participants, track publications, mute state, per-participant connection quality and the reconnection phase, with the reconnection window and the token refresh both configured here. See the spec for the boundary behaviour.

**15. Participant tiles and layout** - Build the tile that renders a participant's video or their initials, carries the mute badge and the name, and the layout that arranges two tiles at the default cap and a uniform grid above it.

**16. Classroom chrome** - Build the in-call header with elapsed time and per-participant quality, the control bar with microphone, camera, device settings, the reserved scenario toggle and the end action, the end confirmation dialog, and the reconnection overlay with its countdown.

**17. Waiting state and screen orchestration** - Build the waiting panel, including the region F06 will mount its scenario into, and the screen that drives the whole sequence from permissions through preview, waiting, live and ended — including the failure surfaces for a full classroom and an unreachable one.

**18. Classroom route** - Add the route with its own authenticated layout, resolving the session server-side and rendering without the application shell's navigation, so a live call is not sharing the screen with a way out of it.

### Stage 5: Dashboard entry and closing the loop

**19. Dashboard hero** - Build the hero banner region from the dashboard mockup, carrying the primary action that opens the classroom and reflecting whether a lesson is already in progress. Mount it above the existing dashboard content.

**20. Design reference update** - Record the hero banner as implemented in the design reference, leaving the module-cards region owned by the features that will fill it, and confirm the completeness guard still passes.

**21. Test suites** - Implement the API integration, webhook and unit suites and the web client suites described in the spec, covering the acceptance criteria that do not require real media.

**22. Manual verification** - Run the two-browser checklist against the local stack — join, presence, mute, camera, device switching, a simulated drop and recovery, and ending from each side — and record the outcome.
