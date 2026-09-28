# Implementation Plan: Objective Activity Execution

**Prerequisites:**
- F03, F12 (Core), F13, F15, F21 and F22 implemented. All report `success` on today's `main`
- F15's `PlanActivityStateService`, `PlanRepository.lock` and the two empty route registries (`apps/web/src/lib/activity-routes.ts`, `apps/mobile/lib/features/plan/activity_routes.dart`). F12's `ProfileIngestionService.ingestActivityOutcome`. F13's `ContentBankService.getPayload`, and the shared `questionSchema` and `answerKeyIssues`. `StorageService` and the MinIO Testcontainers helper
- The migration takes the next free number at implementation time (`0016` on today's `main`)
- One new dependency, `just_audio` in `apps/mobile`. No new environment variable, and no new API or web dependency
- Docker available to Testcontainers (Postgres, Redis and MinIO)
- F17, F18 and F20 are specified in the same wave. Where their work lands first, the shared files conflict only additively: the registries, `codes.ts` (take the next free `ACT` numbers), `app.module.ts`, `schema.prisma`, the shared `index.ts` and `openapi.json` (regenerate, never hand-merge)
- If the `tsx`-based `openapi:generate` script fails silently (the F10/F11/F15 follow-up), generate the snapshot through `pnpm build` and `node dist/openapi/generate.js`
- No mockup exists for the runner or its results. Consider generating a Stitch mockup before Stage 4. Without one, both clients compose from the design-system primitives, as the spec records. Read the `mobile-ui` skill before Stage 5
- For the live check only: a curated listening item (a `meta.json` and an audio file) and a reading or grammar item imported with `content:import`, and a seeded user with an active plan containing objective activities (a processed lesson, or F15's deterministic plan). The automated suites seed their own

---

### Stage 1: Contracts and Data Model

**1. Shared Activity Contracts and Error Codes** - Add the activity contracts to the shared package: the activity and session context, the projected question views including the unscored form, the passage, attempt and result views, the submission, skip and rating inputs, and the rating view, reusing the plan and content schemas already there. Add the six `ACT` error codes with their statuses and messages, then rebuild the package.

**2. Attempt Table and Migration** - Add the objective attempts table with the migration the specification gives, including every check constraint and partial index. Mirror it in the Prisma schema with its relations to users, plan activities and content items, then generate the client on the host.

**3. Storage Range Reads** - Add a streaming read with an optional byte range to the storage adapter, which tells a missing object apart from an unreachable store and falls back to the whole object for an invalid range, leaving every existing method untouched.

---

### Stage 2: Correction and Outcome Core

**4. Question Checks and Projection** - Implement the pure per-question check that classifies each snapshot question as scorable, unsupported in Core or carrying an invalid key, and the runnable rule. Implement the client projection that never carries a key, an explanation or a hidden transcript, the blank split and sizing, and the question fingerprint.

**5. Answer Normalization and Grading** - Implement fill-in-the-blank normalization and matching against every accepted variant, the answer-set validation against the scorable questions, and grading with the score over scorable questions only. Build the per-question result view with the response, the correct answer, the accepted variants and the explanation.

**6. Profile Outcome Builder** - Build the outcome F12's contract receives from a graded attempt: error occurrences per incorrect question and target tag with quotes only where the learner wrote the text, correct encounters only for a fully correct attempt, and the measurements for the competencies each kind trains.

**7. Session Context** - Implement the pure session block (the day's activities in order, the current position and the count) that every activity view carries.

---

### Stage 3: Activity Services and Routes

**8. Attempt Repository and Service** - Implement attempt persistence and the service that starts an attempt, snapshotting the questions and marking the plan activity started, and submits one: grading, storing, ingesting into the profile and completing the plan activity in one transaction under the per-user plan lock. Make it idempotent per attempt, keep the evidence when the plan was replaced, and log flagged questions for the curator.

**9. Skip and Rating** - Implement the kind-agnostic skip, which records the reason through the plan contract and closes any open attempt without touching the ledger, and the kind-agnostic rating, which writes the plan activity and, for an objective activity, its submitted attempt beside the prompt stamp.

**10. Activity View** - Implement the read model that resolves an activity through its carry-over lineage, builds the context and session blocks, and projects the item from the attempt's snapshot or the live payload, withholding keys, explanations, the listening transcript and the source until submission.

**11. Listening Media** - Implement the ownership-checked audio stream for listening activities with byte ranges, mapping a missing object and an unreachable store to their codes and logging the item for the curator.

**12. Routes, OpenAPI and Wiring** - Add the six activity routes with their OpenAPI decorators, register the new components, the binary audio response and the `activities` tag, add the error factories, register the module, and regenerate the committed OpenAPI snapshot.

**13. Curator Signals** - Extend `content:stats` with the difficulty ratings per prompt version and the questions that could not be corrected, counting questions waiting for the Full scope separately.

---

### Stage 4: Web Runner

**14. Web Data and Pure Helpers** - Add the server read for an activity, the browser calls for start, submit, skip and rating and the media URL, the draft storage with its reconciliation rules, the next-step rule, and the active-time hook. Register the five bank kinds in the route registry.

**15. Audio Player Primitive and Icons** - Add the audio player to the design-system primitives with its idle, playing and error states, and the play, pause and cross-circle icons, and show them in the design-system gallery in both themes.

**16. Activity Shell** - Build the kind-agnostic full-screen frame: close, the activity title, the segmented session progress, the skip dialog with preset and free-text reasons, and the non-blocking rating prompt.

**17. Objective Runner and Results** - Build the runner: the passage and listening panes in the layouts the specification describes, one question at a time with locked answers and review dots, the unscored questions, draft saving and resume, lazy attempt creation, and the submitting, offline and save-failed states. Build the results view that follows a successful submission.

**18. Activity Pages and Today** - Add the full-screen activity layout and page with their loading, error, not-found and unavailable states, and change Today's action to `Resume session` when the next activity is in progress.

---

### Stage 5: Mobile Runner and Follow-Ups

**19. Mobile Models, API and Pure Helpers** - Mirror the activity contracts in Dart and add the activities API client, the draft store, and the draft reconciliation and next-step rules with the web's case tables. Add the audio dependency behind a playback service interface and register the five bank kinds in the route registry.

**20. Mobile Design Widgets and Shell** - Add the text field and audio player design widgets mirroring the web, following the mobile UI guide, and build the activity shell with the session progress, the skip sheet and the rating prompt.

**21. Mobile Runner Page** - Build the runner controller with the same state machine, active-time tracking and retry-on-reconnect as the web, and the full-screen runner page with its passage and listening layouts, questions, submission states, results and terminal states. Mount the activity module at the app root, and change the Today tab's action to `Resume session` when the next activity is in progress.

**22. Follow-Up Notes in Finished Features** - Record dated follow-up notes in the progress files of the features whose contracts this one now calls or extends: the profile's first activity caller with its encounter and measurement rules, the content bank's projection, media route and new stats sections, the generation prompts' ratings, and the plan's registered kinds, reused lock and resume label.
