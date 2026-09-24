# Implementation Plan: Speech-to-Text Transcription

**Prerequisites:**
- F07 (lesson recording) is implemented through its fifth stage: verified `audio.ogg` objects, `lesson_pipeline_branches` rows and the `PipelineLaunchPort` seam. Its final verification can close in parallel. F02's vault and `CredentialExecutorService` are in place.
- Docker Desktop must be running, both for the stack and for Testcontainers. The integration suites use the Postgres, Redis and MinIO containers the F07 suites already start.
- Two new runtime dependencies, `bullmq` and `@nestjs/bullmq`, installed on the host and in the `api` container (the containers have their own `node_modules` volumes).
- One new environment variable, `TRANSCRIPTION_LOCALE`, which defaults to `en-US`. Editing `.env` does not reach a running container, so recreate `api` if it is set.
- The live checks use the user's own Azure Speech key already recorded as `TEST_AZURE_SPEECH_API_KEY` / `TEST_AZURE_SPEECH_REGION` in `.env`. The 60-minute throughput check spends about an hour of that key's quota, so it runs only with the user's go-ahead.
- `docs/api/openapi.json` is regenerated once the routes land, per the project's OpenAPI directive.
- No client work: F19 renders everything this feature exposes, on both clients.

---

### Stage 1: Dependencies, contracts and data model

**1. Queue dependencies and root wiring** - Add BullMQ and its NestJS integration to the API, and register the root queue connection from the existing Redis URL so that it is only built when the application actually starts, never during OpenAPI preview generation. Confirm the API still boots and the snapshot generator still runs without Redis.

**2. Environment contract** - Add the transcription locale to the API's environment contract, with its default, and document it in the example environment file.

**3. Shared pipeline and transcript contracts** - Add the pipeline and transcript schemas and types to the shared package, widen the recording contract's branch vocabularies so a branch past recording still reads truthfully, and register the two pipeline error codes with their statuses and messages. Rebuild the shared package.

**4. Data model and migration** - Add the stage, transcript and utterance models, widen the branch constraints, and write the migration with the constraints and indexes the spec lists. Apply it to the local database and regenerate the Prisma client on the host and in the container.

**5. PRD alignment** - Update the PRD so the F08 capability describes word confidence as present only where the provider reports it, and so F09's low-confidence exclusion and confidence ranking fall back to utterance confidence, matching the decision recorded in the spec.

### Stage 2: Pipeline runner

**6. Stage handler contract and registry** - Define what a stage handler declares (its stage, the credential it runs under, its retry policy) and the typed outcomes it can raise. Build the registry handlers register with at startup, and have it expose each stage's retry policy in a way the integration suites can override.

**7. Pipeline state service** - Build the service that owns every stage write and keeps the branch pointer in step: creating and resetting stage rows, the running, retrying, blocked and failed transitions, and the guarded completing transaction that commits a handler's result, completes the stage, queues the next one and moves the branch forward.

**8. Queue and processor** - Build the queue service with its deterministic job ids, and the worker that runs a stage's handler. The worker skips stale runs, turns each typed outcome into the right stage state, stops retrying on non-retryable outcomes, and applies each stage's own backoff.

**9. Drain and resume job** - Build the recurring job that creates stage rows for branches queued before this feature existed, resumes blocked stages once their owner has a usable key for the blocked provider, and makes sure every pending stage with a registered handler has a live job. One failing row never stops the sweep.

**10. Launch from recording** - Replace the recording seam's logging default with the real launch, which writes the transcription stage row and then adds its job, and have the recording finalizer await it before marking the branch launched. A failed enqueue is left for the drain to recover.

### Stage 3: Azure transcription

**11. Fast transcription client** - Build the only component that calls Azure's fast transcription: the regional request with the verbatim, single-speaker definition and the per-attempt timeout, and the mapping of every provider outcome to a typed error that carries the HTTP status and never the key.

**12. Response mapping and speech-to-text capability** - Validate the provider's response and map its phrases to ordered utterances with word timings. Expose the file and clip transcription capability that runs under the owner's key through the credential executor, and is audited under the caller's feature label.

**13. Transcript writer** - Build the writer that, inside the completing transaction, replaces any earlier transcript for that participant and lesson with the new one, storing its provenance and counts and bulk-inserting the utterances.

**14. Transcription stage handler** - Implement the transcription stage: read the verified audio, fail immediately if storage cannot provide it, transcribe, map credential and provider errors to blocked, retryable or failed outcomes with the spec's reasons, reject an empty result, and commit through the completing transaction. Register it with the pipeline at startup.

### Stage 4: Routes and document

**15. Lesson access and pipeline routes** - Extract the participant check both new route families share, and expose the caller-scoped pipeline read, including the stage derived from recording, along with the caller's retry and its two conflict cases. Put OpenAPI decorators on each route.

**16. Transcript route** - Expose the merged lesson transcript: every participant's utterances in lesson time, detail only on the caller's own, and each speaker's coarse status. Put OpenAPI decorators on it.

**17. OpenAPI document** - Register the new components and tags, update the recording view's component for the widened vocabulary, and regenerate the committed specification.

### Stage 5: Closing the loop

**18. Test suites** - Implement the unit and integration suites the spec describes, including the Azure fake at the client boundary and the extensions to the recording finalization suite.

**19. Live verification** - Run the spec's live checklist against the local stack with the user's own Azure key: the endpoint and response shape for their region, the blocked-and-resume timing, the storage failure and retry, and, with the user's go-ahead, the 60-minute throughput check. Record each outcome and any soft-fails.

**20. Follow-ups for neighbouring features** - Record in F07's progress follow-ups that its launch seam is now asynchronous and real. Confirm that the spec's notes for F09, F10, F11, F18 and F19 still match what was built.
