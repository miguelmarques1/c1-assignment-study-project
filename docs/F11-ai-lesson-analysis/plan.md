# Implementation Plan: AI Lesson Analysis

**Prerequisites:**
- F10 is implemented: branches wait at `lesson_analysis` / `queued`, and `PronunciationResultReader` returns each participant's result. The runner and speech pieces are in place: F02's vault, F04's prompt library, F06's scenario and card rows, and F08's runner and utterances.
- Docker Desktop must be running, both for the stack and for Testcontainers. The integration suites use the Postgres, Redis and MinIO containers the F08–F10 suites already start.
- No new runtime dependency and no new environment variable.
- The live checks use the user's own Gemini key (`TEST_GEMINI_API_KEY` in `.env`) and the stored Azure key. Each spends one or two prompt executions. The two-window lesson is optional and needs the user.
- `docs/api/openapi.json` is regenerated whenever a route or contract changes, per the project's OpenAPI directive. If the `tsx`-based `openapi:generate` script crashes silently (F10's follow-up), generate through `pnpm build` instead.
- No client work: F19 renders the analysis on both clients.

---

### Stage 1: Contracts, taxonomy and data model

**1. Shared contracts** - Add `profile_update` to the pipeline vocabulary, along with the analysis failure codes. Add the analysis contract: competencies, severity, scenario context, error and fit views, and the caller's analysis view. Rebuild the shared package.

**2. Error taxonomy** - Write the v1 taxonomy file with the three analysis families and 36 labelled tags. Add its loader with the file contract and fingerprint, and a module that holds it in force from boot. Pin the fingerprint and the file rules in the taxonomy unit suite.

**3. Data model and migration** - Add the analysis and analysis-error models, widen the stage and reason checks for `profile_update` and the analysis codes, and write the migration with the constraints and indexes the spec lists. Apply it locally and regenerate the Prisma client on the host and in the container.

**4. Prompt library and seams** - Return token usage and latency on the prompt execution result. Export the credential executor's authentication predicate. Move the profile tags port into its own profile module and repoint the scenario module and `apps/api/AGENTS.md` at it. Keep F04's and F06's suites green.

**5. PRD alignment** - Update the F11 Error Handling sentences so the quota and timeout cases say "after the third retry", as the spec records.

### Stage 2: Analysis prompt

**6. Prompt v2 and boot check** - Rewrite `lesson-analysis.yaml` as version 2: system text, template, variables, schema with the taxonomy `enum`, constraints and one example that validates. Add the boot step that refuses to start when the prompt's `enum` and the taxonomy's analysis tags disagree, and run it right after the prompts load.

**7. Live prompt check** - With the user's Gemini key, run the v2 prompt through the real execution service on a realistic transcript, both with and without a scenario and with a truncated transcript. Confirm the nullable fit form and the enum are accepted, and switch to the `anyOf` form only if the live call requires it. Record tokens, latency, outcomes and the quote discard rate.

### Stage 3: Analysis stage

**8. Transcript rendering and budget** - Implement the pure transcript renderer, with anonymous speaker labels and lesson-clock timestamps, and the budget that drops the other participants' oldest turns before the owner's and writes the truncation note.

**9. Input builder** - Build the component that loads the lesson's transcript, the owner's pronunciation result, the situation and the owner's own card, the profile tags and the taxonomy. It derives the scenario context and renders every prompt variable plus the metadata to store.

**10. Output rules and classification** - Implement the pure output rules: verbatim quote matching and discards, de-duplication, the recurring-tag filter, the fit partition or omission, and the curator flags. Implement the classifier that maps every thrown outcome to blocked, retryable or failed with its Gemini sentence.

**11. Result writer and reader** - Build the writer that replaces the owner's analysis and errors inside the completing transaction, and the reader that returns an owner's analysis, and their previous one, for the route and for F12.

**12. Stage handler and pipeline order** - Implement the analysis stage as the spec's flow and outcome table describe, with its retry policy, and register it. Append `profile_update` to the pipeline order, wire the modules, extend the Gemini fake for analysis calls, and add the stage's integration suite.

**13. Adapting earlier suites** - Load the prompt registry in the pipeline fixtures and add the analysis retry override. Move the F08, F09 and F10 assertions that expected branches resting at `lesson_analysis` / `queued` to the blocked resting point that keyless fixture users now reach. Run every pipeline suite green again.

### Stage 4: Route and document

**14. Analysis route** - Expose the caller's analysis view: a truthful status, competencies with deltas against the previous analysed lesson, errors ordered by severity with taxonomy labels, the fit, topics and notes. Put OpenAPI decorators on the route, and add the route suite, including the privacy and blocked-state checks.

**15. OpenAPI document** - Register the new component and tag, and regenerate the committed specification.

### Stage 5: Verification and hand-off

**16. Live verification** - Run the spec's live checklist on the local stack with the user's keys: a scratch lesson through real transcription, selection, assessment and analysis read as that user, and the blocked-then-resumed path on the Gemini key. Record every outcome and soft-fail, and delete the scratch data.

**17. Follow-ups for neighbouring features** - Append dated notes to F10's progress (the new resting stage and adapted tests), F04's (prompt v2 supersedes the v1 schema F04 fixed) and F06's (the port moved). Confirm that the spec's notes for F12, F15 and F19 still match what was built, and correct them where the implementation differs.
