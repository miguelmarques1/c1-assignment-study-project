# Implementation Plan: Pronunciation Assessment

**Prerequisites:**
- F09 (excerpt selection) is implemented: branches wait at `pronunciation_assessment` / `queued`, and `ExcerptSelectionReader` returns each participant's excerpts. F02's vault, F07's `audio.ogg` objects and F08's runner and speech module are in place.
- Docker Desktop must be running, both for the stack and for Testcontainers. The integration suites use the Postgres, Redis and MinIO containers the F08/F09 suites already start.
- No new runtime dependency (`ffmpeg-static` is already in use) and no new environment variable (the locale is F08's `TRANSCRIPTION_LOCALE`).
- The live checks use the user's own Azure Speech key recorded as `TEST_AZURE_SPEECH_API_KEY` / `TEST_AZURE_SPEECH_REGION` in `.env`. Each spends only seconds of quota. The two-window lesson is optional and needs the user.
- `docs/api/openapi.json` is regenerated whenever a route or contract changes, per the project's OpenAPI directive.
- No client work: F19 renders the pronunciation section, the counter and the badge scores on both clients.

---

### Stage 1: Contracts, runner extension and data model

**1. Shared contracts** - Add the analysis stage to the pipeline vocabulary, along with the pronunciation failure codes and the stage view's progress counter. Add the pronunciation contract (scores, excerpt pronunciation, worst phonemes and words, the caller's pronunciation view), and put the excerpt pronunciation on the transcript badge. Rebuild the shared package.

**2. Data model and migration** - Add the per-excerpt assessment and per-lesson result models and the stage progress columns, widen the stage and reason checks, and write the migration with the constraints and indexes the spec lists. Apply it locally and regenerate the Prisma client on the host and in the container.

**3. Runner extension** - Give the stage run context a way to write under the run's ownership and to report progress. Have the state service guard those writes and reset progress whenever a stage is re-queued, and show progress on the pipeline view. Cover the guard and the reset with the runner's tests.

**4. PRD alignment** - Update the F10 ledger sentence so it says the tags are recorded on the lesson's result for the ledger to ingest, as the spec records.

### Stage 2: Azure pronunciation capability

**5. Pronunciation client** - Build the only component that calls Azure's short-audio pronunciation assessment: the regional request with the phoneme, prosody, miscue and IPA parameters and the WAV body, and the mapping of every provider outcome to a typed error that never carries the key.

**6. Response mapping and clip capability** - Validate the detailed result and map it to the five scores, words with merged error types and phonemes in clip-relative milliseconds. Expose the single-clip capability under the owner's key through the credential executor, audited under the caller's feature label.

**7. Live endpoint check** - With the user's key, call the real endpoint on a short speech clip. Confirm the endpoint, the IPA alphabet, prosody and the response shape, and add the SAPI-to-IPA fallback only if the live result requires it.

### Stage 3: Pronunciation stage

**8. Clip slicer** - Build the ffmpeg component that cuts an exact excerpt range into a 16 kHz mono WAV and rejects corrupt, empty or too-small output.

**9. Aggregation rules** - Implement the pure aggregation: duration-weighted means, the worst phonemes and words, the phoneme failure tags, the 60% decision, the partial flag and the notes.

**10. Excerpt store and result writer** - Build the store that creates, resets and records each excerpt's assessment under the run's ownership, and the writer that replaces the participant's result inside the completing transaction.

**11. Stage handler and pipeline order** - Implement the pronunciation stage as the spec's flow and outcome table describe: download once, slice and assess each unassessed excerpt with inline retries, block on a key problem, abandon on quota, drop on slicing failure, report progress, settle with the 60% rule, and clean up temporary files in every outcome. Register the handler, append the analysis stage to the pipeline order, wire the module, and add the stage's integration suite.

**12. Adapting F09's suites** - Move the F09 tests and fixtures that assumed branches rest at pronunciation assessment over to the analysis stage, and give the shared fixtures the new retry overrides and work root. Run every pipeline suite green again.

### Stage 4: Routes and document

**13. Pronunciation route** - Expose the caller's pronunciation view: a truthful status, the result with its flags, notes and worst lists linked to utterances, and every excerpt's status and scores. Put OpenAPI decorators on the route.

**14. Transcript badge and pipeline progress** - Add each caller-selected excerpt's pronunciation status and scores to the transcript badge, identical to the route's, and confirm progress shows on the pipeline view. Extend the route suites accordingly.

**15. OpenAPI document** - Register the new component and tag, and regenerate the committed specification.

### Stage 5: Verification and hand-off

**16. Live verification** - Run the spec's live checklist on the local stack with the user's key: a scratch lesson through real selection and real assessment read as that user, and the blocked-then-resumed path keeping completed excerpts. Record every outcome and soft-fail, and delete the scratch data.

**17. Follow-ups for neighbouring features** - Append dated notes to F09's progress about the adapted tests and the stage it now hands to, and confirm the spec's notes for F11, F12, F18 and F19 still match what was built, correcting them where the implementation differs.
