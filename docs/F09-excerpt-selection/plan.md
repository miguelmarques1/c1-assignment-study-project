# Implementation Plan: Excerpt Selection

**Prerequisites:**
- F08 (speech-to-text transcription) is implemented: the pipeline runner, the transcript and utterance tables, the transcript route, and branches waiting at `excerpt_selection` / `queued`.
- Docker Desktop must be running, both for the stack and for Testcontainers. The integration suites use the Postgres, Redis and MinIO containers F08's suites already start.
- No new runtime dependency and no new environment variable. The `yaml` package the prompt loader uses is already an API dependency.
- The rules file is read only at boot, like prompts. Restart the API after editing it.
- The first boot with F09 selects every branch already waiting at `excerpt_selection` in the local database. That costs nothing, because the stage calls no provider, but the live check lists those branches before and after.
- `docs/api/openapi.json` is regenerated once the transcript view changes, per the project's OpenAPI directive.
- No client work: F19 renders the badge and the stage on both clients, and adds the Dart models.
- The optional real-speech confidence check spends about 10 minutes of the user's Azure quota, so it runs only with their go-ahead.

---

### Stage 1: Contracts, rules and data model

**1. Shared contracts** - Add `pronunciation_assessment` to the pipeline stage vocabulary. Add the excerpt contract (the per-utterance excerpt object and the selection summary), and extend the transcript view with the caller-only excerpt field and summary. Rebuild the shared package.

**2. Rules file and loader** - Add the versioned excerpt-selection rules file with version 1's thresholds and filler lexicon, the schema that enforces its invariants (including the 6-minute bound), and the fingerprint. Add the service that loads the file at module init and stops the boot with every issue listed. Cover it with unit tests that pin each version's fingerprint.

**3. Data model and migration** - Widen the branch and stage checks with the new stage, add the selection and excerpt models, and write the migration with the constraints and indexes the spec lists. Apply it to the local database and regenerate the Prisma client on the host and in the container.

**4. PRD and agent docs alignment** - Update the PRD's F09 sparse-flag sentence and badge example to match the spec's decisions. Extend the AGENTS.md gotcha about boot-time YAML to cover the rules folder.

### Stage 2: Selection stage

**5. Selector** - Implement the pure selection function: token normalization, per-utterance metrics, the eligibility filters, the ranking with its deterministic tie-breaks, the greedy windowed selection under the cap, the sparse flag and the reason sentence. Cover every rule with the boundary tests the spec lists.

**6. Pronunciation focus port** - Define the focus source port and its injection token, and bind the default source, which returns no tags, so F12 can replace it without touching this feature.

**7. Writer and reader** - Build the writer, which replaces a participant's selection and excerpts inside the stage's completing transaction, and the reader that returns a participant's selection and excerpts in rank order for the transcript route and for F10.

**8. Stage handler and pipeline order** - Implement the `excerpt_selection` handler with no provider and its short retry policy. It loads the owner's transcript, asks the focus source, selects and commits. Register it at startup. Append the pronunciation assessment stage to the pipeline order, so a completed selection leaves the branch waiting there, and wire the module into the application. Add the integration suite for the stage.

**9. Adapting F08's suites** - Move the F08 tests and fixtures that used `excerpt_selection` as the resting stage or the stage without a handler over to `pronunciation_assessment`. Make fixtures that pass through selection seed a selection too, so the running drain cannot race their assertions. Run every F08 suite green again.

### Stage 3: Transcript exposure and document

**10. Transcript route extension** - Have the transcript view read the caller's own selection through the reader. Project the excerpt object onto the caller's selected utterances only, and add the caller's selection summary, never another participant's. Extend the transcript route and merge tests accordingly.

**11. OpenAPI document** - Regenerate the committed specification so the transcript view's new fields and the widened stage vocabulary appear, and confirm the snapshot test passes.

### Stage 4: Verification and hand-off

**12. Live verification** - Run the spec's live checklist on the local stack: the branches already waiting before first boot, a scratch lesson that exercises every rule with its stage timing, and the transcript and pipeline views as both seeded users. Then, with the user's go-ahead, the real-speech confidence distribution. Record each outcome and any soft-fails, and delete the scratch data.

**13. Follow-ups for neighbouring features** - Append a dated note to F08's progress follow-ups about its adapted tests. Confirm the spec's notes for F10, F12, F19 and the pipeline's final stage still match what was built, correcting them where the implementation differs.
