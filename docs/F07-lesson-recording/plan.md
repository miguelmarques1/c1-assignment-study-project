# Implementation Plan: Lesson Recording

**Prerequisites:**
- F05 (live classroom) is implemented and in place, along with the classroom screens as F06 rebuilt them. F07 builds on F05's `lessons` and `lesson_participants` rows, its signed webhook route and its lifecycle sweeper.
- Docker Desktop must be running, both for the stack and for Testcontainers. The new `livekit/egress` image is large, so pull it before the first `docker compose up`.
- One new runtime dependency, `ffmpeg-static`, installed on the host and in the `api` container (the containers have their own `node_modules` volumes).
- The finalization and storage suites start a MinIO container through `GenericContainer`, alongside the existing Postgres and Redis ones.
- Editing `.env` does not reach a running container. After adding the two new variables, recreate `api` and `web`. `livekit` has to be recreated too, since it gains a Redis dependency.
- `docs/api/openapi.json` is regenerated once the routes land, per the project's OpenAPI directive.
- The manual verification needs WebRTC and two browsers, so it runs in the user's own Chrome. The embedded preview pane cannot establish a call.
- Two product decisions taken with this spec are already in `docs/prd.md` and `docs/context.md`: an egress failure affects only that participant's branch, and a recording error requests a fallback study plan that F15 will compose. F07 only fires that request.

---

### Stage 1: Infrastructure, contracts and data model

**1. Egress in the local stack** - Add the egress service to the Compose stack with its own configuration file, and give the LiveKit server the Redis connection egress needs to reach it, on a Redis database separate from the application's. Confirm that the stack still comes up and that the egress container reports healthy.

**2. Environment contract** - Add the optional egress storage endpoint and the egress health address to the API's environment contract, to the example environment file and to the API service in Compose.

**3. Shared recording contract** - Add the recording schemas and types to the shared package: the live recording block the session read gains, the caller-scoped recording view, the branch and failure vocabularies, and the new health dependency name. Register the two recording error codes with their statuses and messages.

**4. Recording data model and migration** - Add the recording columns to the lesson and participant models, add the segment and pipeline-branch models, and write the migration with the constraints and indexes the spec lists. Apply the migration to the local database.

### Stage 2: Storage, egress and assembly adapters

**5. Storage adapter extension** - Extend the storage adapter so it can tell a missing object from an unreachable store, and so it can stream files up and down and delete in bulk, all without changing any behaviour its current callers rely on.

**6. Egress client** - Build the service that is the only place talking to LiveKit's egress API: starting an audio track egress to a segment key in object storage, stopping one, and listing a room's egresses. Transport failures come out as typed errors.

**7. Audio assembler** - Build the ffmpeg-backed service that turns a participant's segments and their start times into one continuous audio file, with silence wherever nothing was captured. It reports the output's length and leaves no temporary files behind, whatever the outcome.

### Stage 3: Recording during the lesson

**8. Recording state service** - Build the service that owns every write to recording state (segments, the participant's recording columns, the lesson's recording columns, the finalization lease and the branches), and that projects the live recording block for a given caller.

**9. Egress orchestration** - Build the orchestrator that starts an egress for each published microphone when the lesson goes live and for each later microphone publication. It retries a failed start once, restarts an unexpectedly stopped egress once, and moves the lesson between `starting`, `recording` and `not_recording`. Replayed events must never produce a second egress for the same track.

**10. Webhook and lifecycle wiring** - Route the track and egress events from the existing webhook route to the orchestrator, and have the lifecycle service trigger the start only on the event that actually moved the lesson to live.

**11. Live recording in the session read** - Extend the session read so each caller gets the lesson-wide recording state and their own captured audio, without the response ever carrying another participant's figures.

### Stage 4: Finalization and hand-off

**12. Classification rules** - Implement the pure rules that turn a lesson's duration and each participant's segments and verified object into a participant outcome, a failure code with its reason, and the lesson-level recording status. The spec's failure-code table is the reference.

**13. Finalization job** - Build the recurring job that claims ended lessons with unfinished recordings. It stops leftover egress, waits for or reconciles every segment, assembles and verifies each participant's audio, deletes the segments, and writes one branch per participant, applying the storage outage window along the way.

**14. Pipeline and fallback seams** - Add the two seams: one launches a participant's pipeline for transcription to take over later, the other requests a fallback study plan when a participant's recording failed. Each is called at most once per branch, and both default implementations only log.

**15. Recording routes and document** - Expose the caller-scoped recording read and the retry, each with its OpenAPI decorators and error responses. Register the new components and regenerate the committed specification.

**16. Health probe** - Add the egress container to the health report, so a recording outage points at the right container.

### Stage 5: Classroom surfaces and closing the loop

**17. Web recording client and signals** - Add the browser-side call for the recording read. Have the room hook expose LiveKit's recording-status change, and have the classroom screen refetch the session as soon as that signal fires.

**18. Recording indicator and banner** - Build the indicator for the live stage's reserved top-bar slot and the dismissible not-recording banner, both composed from the design system's badge and page-state conventions.

**19. End dialog line and cap notice** - Add the captured-audio line to the end dialog as the mockup lays it out, with the one new icon it needs. Show the automatic-end notice in the classroom when the 2-hour cap closed the lesson.

**20. Design reference update** - Record the recording indicator and the captured-audio line as implemented in the design reference, and confirm the completeness guard still passes.

**21. Test suites** - Implement the API integration and unit suites and the web suites the spec describes, including the storage adapter suite F01 scheduled against this feature.

**22. Manual verification** - Run the spec's checklist against the local stack in the user's own browser, then record the outcome and any soft-fails: indicator timing, a mute and a rejoin each producing one continuous file, an egress outage, a short lesson, and a storage outage followed by a retry.
