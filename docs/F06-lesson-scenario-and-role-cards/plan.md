# Implementation Plan: Lesson Scenario and Role Cards

**Prerequisites:**
- F02 (BYOK credential vault), F04 (prompt library), F05 (live classroom) and F21 (design system) implemented — all four are in place
- No new runtime dependency: the situation and card calls go through F04's existing `PromptExecutionService`, which already owns credential resolution, the schema retry, the timeout budget and the telemetry row
- Both seeded accounts need a valid Gemini key stored through F02 for an end-to-end run; without one the lesson is expected to reach `no_scenario` rather than fail
- `apps/api/prompts/scenario-situation.yaml` is modified by this feature and its version is bumped, so the prompt-loader boot check and F04's loader suite both cover it again
- `docs/api/openapi.json` is regenerated after the routes land, per the project's OpenAPI directive
- The local stack must be running for the manual verification stage, with the API dev server restarted so the revised prompt file is re-read at boot

---

### Stage 1: Contracts, prompt and data model

**1. Situation prompt revision** - Revise the shared-situation prompt so the vocabulary domain arrives as an input rather than being invented by the model, and bump its version. See the spec for the variable contract and why the response schema keeps echoing the domain back.

**2. Shared scenario contract** - Add the scenario schemas and types to the shared package so the API and the web client read one definition of a situation, a role card, their statuses and the fifteen vocabulary domains. Register the new scenario error codes alongside the existing vocabulary.

**3. Scenario data model and migration** - Add the scenario and role-card models to the Prisma schema and write the migration, including the uniqueness that keeps one scenario per lesson and one card per participant, and the index the domain rotation and F20 read through. See the spec for columns, constraints and the reserved-word note on the constraint column.

### Stage 2: Generation

**4. Vocabulary domain rotation** - Build the service that holds the fifteen domains, reads which ones the registered participants have seen recently, and returns one they have not. See the spec for the lookback window and the exhaustion fallback.

**5. Shared situation generation** - Build the service that opens the scenario record, runs the situation prompt with the opening participant's own key, and records the outcome — including the two paths where no situation is produced. This service owns every write to the scenario record.

**6. Role assignment and private card generation** - Build the service that draws an unassigned role from the situation for a participant and generates their private card with their own key, taking the other roles' labels only. Include the seam that will supply recurring weakness tags once the profile feature exists.

**7. Generation orchestration** - Wire the two generators behind a single entry point the classroom calls when a participant is registered, so the situation is produced once and each card follows for whoever is present. Generation must not hold up the response that triggered it.

### Stage 3: The scenario surface

**8. Authenticated scenario routes** - Expose the scenario read, the reroll and the retry, each with its OpenAPI decorators and its error responses. The read returns the situation together with the caller's own card and nothing belonging to anyone else — see the spec for why that scoping lives at the endpoint.

**9. Reroll and retry rules** - Implement the server-side rules behind those two actions: who may call them, how many times, and the point after which the scenario can no longer change. See the spec for which of the two consumes an attempt and which does not.

**10. Document regeneration** - Register the new components in the OpenAPI document and regenerate the committed specification.

### Stage 4: The classroom surfaces

**11. Web scenario client and state** - Add the browser-side calls for the three scenario routes, typed against the shared contract, and the hook the screen reads from — including when it should stop asking for updates.

**12. Situation and role card components** - Build the shared situation display and the private role card panel from the design system's primitives, following the mockup's reading of each. The card must carry its own visibility marker and its own failure message.

**13. Waiting-area region and in-call panel** - Mount the scenario into the labelled region the classroom already reserves for it, with its loading, failure and no-scenario states, and build the collapsible in-call panel behind the control-bar toggle that is currently present but disabled.

**14. Dashboard recommended-scenario card** - Build the recommended-scenario card from the dashboard mockup and mount it below the existing hero. See the spec for the one element of that card that is deliberately not built.

### Stage 5: Closing the loop

**15. Design reference update** - Record the recommended-scenario card as implemented in the design reference, leaving the navigation destination and the module-card region with the features that will own them, and confirm the completeness guard still passes. The guard currently expects that card among the deferred regions, so it needs the same correction the hero banner required.

**16. Test suites** - Implement the API integration and unit suites and the web suites described in the spec, covering the acceptance criteria that do not require a live model call.

**17. Manual verification** - Run the two-browser checklist against the local stack — the situation appearing for both participants, different roles, each card private to its owner, a reroll changing both cards, and the in-call panel over live video — and record the outcome.
