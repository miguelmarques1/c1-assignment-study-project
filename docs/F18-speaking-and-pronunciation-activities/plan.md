# Implementation Plan: Speaking and Pronunciation Activities

**Prerequisites:**
- F02, F03, F08, F10, F12 (Core), F15, F19, F21 and F22 implemented. All report `success` on today's `main`
- F15's `PlanActivityStateService` and its empty route registries on both clients. F12's `ProfileIngestionService.ingestActivityOutcome` and `ErrorLedgerReader.unmasteredTags`. F08's `SpeechToTextService.transcribeClip`. F10's `PronunciationAssessmentService.assessClip`, `ExcerptClipSlicer` and `weightedScores`. F03's `AudioRecorderService`
- The migration takes the next free number at implementation time (`0016` on today's `main`; F16, F17 and F20 may land migrations in the same wave)
- One new dependency, `just_audio`, in the Flutter app. No new API or web dependency (`ffmpeg-static` is already in use), and no new environment variable
- Docker available to Testcontainers (Postgres, Redis and the MinIO container the storage suites already start)
- Before building a screen, read the dashboard table in `design/README.md`, the `english_quest_dashboard` mockup's `Treino de Pronúncia` card, and, for Flutter, the `mobile-ui` skill. The runner screens have no mockup
- For the live check only: the user's Azure Speech key as `TEST_AZURE_SPEECH_API_KEY` / `TEST_AZURE_SPEECH_REGION`, and a real lesson track to slice a speech clip from. The automated suites fake Azure at the client boundary
- If F16 has already landed a shared difficulty-rating component when this runs, reuse it instead of building one (spec A24)

---

### Stage 1: Contracts, Corpus and Data Model

**1. Shared Speaking Contracts and Error Codes** - Add the speaking contracts to the shared package: shapes, attempt states, failure codes, the block reasons, words, failing phonemes, the attempt result and attempt view, the task view, the limits, the activity view, the rating input and view, and the client-attempt header name. Add the nine `SPEAK` error codes with their statuses and messages, then rebuild the package.

**2. Speaking Task Corpus** - Write the versioned speaking corpus: at least 30 read-aloud passages of plain C1 prose, each declaring the phonemes it drills with example words from its own text, and at least 20 open-response prompts with their target tags and hints, covering every phoneme, discourse and vocabulary tag the specification requires. Load it at boot against the taxonomy with a refusal to start on an invalid file, following the study plan rules pattern, and pin its fingerprint and coverage in tests.

**3. Data Model and Migration** - Add the speaking tasks and speaking attempts tables with the migration the specification gives, including every CHECK constraint and the partial unique indexes that enforce the attempt limit and the single attempt in flight. Mirror them in the Prisma schema with the relations to users and plan activities, apply the migration locally, and regenerate the client on the host and in the container.

---

### Stage 2: Scoring Core

**4. WAV Validation and Body Reading** - Implement the pure WAV header parser with the format, chunk and duration rules from the specification. Implement the capped reader that takes a raw audio body from the request and turns an oversized or mistyped body into the right error envelope.

**5. Token Alignment and Segment Planning** - Implement display tokenization and the deterministic alignment of display tokens to recognized or assessed words. Implement the segment planner, which trims silence, cuts long recordings at word gaps under the REST cap, and slices a read-aloud passage into contiguous per-segment references.

**6. Attempt Result Assembly** - Implement the merge of segment results into recording time with duration-weighted scores through F10's exported helper, the failing-phoneme grouping with its examples, the display words for both shapes, and the recognized-word count. Export F10's weighted-score helper additively, leaving its behaviour and tests unchanged.

**7. Attempt Policy and Profile Outcome** - Implement the pure rules for when the activity is blocked, when an upload or a re-score is allowed, when a scoring attempt is stale, which attempt is best, and which failures are re-scorable. Implement the builder that turns the best attempt into F12's activity outcome, with its measurement, phoneme occurrences and correct encounters.

**8. Task Selection** - Implement the deterministic ranking that picks a read-aloud passage from the activity's target phonemes, the owner's other unmastered phonemes and recent use, and an open-response prompt from its target tags. Include the focus tags shown to the learner.

---

### Stage 3: Scoring Service and Attempt Flow

**9. Scorer Service** - Implement the provider pass on the owner's key: transcription when the shape or the length needs it, the ten-word floor, segment slicing in a per-attempt work directory, sequential assessment with inline retries, failure classification, the scoring budget, and cleanup of every temporary file. It returns a scored, discarded or failed outcome.

**10. Task Materialization and the Activity View** - Implement the activity read: resolve the activity through its carry-over lineage, reject kinds that are not speaking, materialize the task once for the lineage root unless the plan is archived, read the owner's Azure status for the gate, and map everything to the activity view. Add the rating through F15's contract.

**11. Upload Flow** - Implement the attempt upload: replay by client attempt id, the credential and plan checks, header validation, the reservation transaction that starts the plan activity, storage under the per-attempt key with compensation on failure, scoring, and the settling transaction. The settling transaction assigns the ordinal, sends the new best to the profile and completes the plan activity on the first score. Delete a discarded clip's audio after commit.

**12. Re-score, Lease and Audio** - Implement re-scoring from stored audio under the same limit and in-flight rules, the conversion of a stale scoring attempt to an interrupted failure, and the owner-only audio stream.

---

### Stage 4: HTTP Surface

**13. Speaking Routes and OpenAPI** - Add the five speaking routes with their OpenAPI decorators, including the binary request and response bodies and the client-attempt header. Register the view components and the `speaking` tag, add the error factories, register the module, and regenerate the committed OpenAPI snapshot.

---

### Stage 5: Web

**14. Web Data Layer and Route Registration** - Add the server read for a speaking activity, the browser calls for upload, re-score, rating, polling and fetching an attempt's audio, and the pure WAV encoder. Register the two speaking kinds in the activity route registry so `Start session` and the plan's activity links reach the runner.

**15. Capture and Playback Hooks** - Build the recording hook over `MediaRecorder`: live level samples for the waveform, the elapsed timer, the automatic stop at the limit, encoding to 16 kHz mono WAV on stop, and the microphone error cases. Build the playback hook, which plays a local recording or a stored attempt in full or one word's segment with padding.

**16. Speaking Runner Components** - Build the runner from the design-system primitives: the task card for both shapes, the recorder panel with waveform, timer and attempt counter, the review panel with play, discard, submit and the upload-failure retry, the result with coloured words, five meters and failing phonemes, the attempt list with replay and re-score, the gates, and the difficulty rating. Add the play, stop and voice icons to the icon set and the design-system gallery, and export F19's colour bands for reuse.

**17. Speaking Page, Dashboard Card and Design Reference** - Add the speaking page with its loading and error states, the development-only WAV upload, and the unsent-recording guard. Build the pronunciation practice card in the mockup card's visual language with every state the specification lists, and place it on the dashboard under the today card. Record the mockup region as implemented in the design reference.

---

### Stage 6: Mobile and Follow-Ups

**18. Recorder and Player** - Confirm against the recording package's documentation that the current encoder writes headerless audio, then switch the recorder to WAV output and add its amplitude stream. Add `just_audio` and a small player that plays a file in full or one word's segment.

**19. Mobile Models, API and Controller** - Mirror the speaking contracts in Dart, add the speaking API client for reading, uploading, re-scoring, rating and downloading audio, and add the controller with the same states as the web runner, the retained recording for retries, the microphone rationale flag and the poll while scoring.

**20. Speaking Screen and Routes** - Build the speaking screen and its widgets following the mobile UI guide: the task card, the recorder with waveform and timer, review, the result with tappable red words, the attempt list, the rating, the gates, and the rationale sheet before the first permission prompt. Mount its module in the shell and register both kinds in the mobile route registry.

**21. Today Pronunciation Card** - Add the pronunciation practice card to the Today tab under the session, mirroring the web card's states from the plan Today already loads and the owner's credential list.

**22. Follow-Up Notes in Finished Features** - Record dated follow-up notes in the progress files of the features this one extended or first exercised: the recorder's encoder and amplitude stream, the exported weighted-score helper and first outside caller of the clip capability, the first activity caller of profile ingestion with encounters, the registered speaking kinds and state calls on the plan contract, and the exported colour bands.
