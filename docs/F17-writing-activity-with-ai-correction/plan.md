# Implementation Plan: Writing Activity with AI Correction

**Prerequisites:**
- F02, F03, F04, F12 (Core), F15 and F21 are implemented, and each reports `success` on today's `main`. F11's and F19's shared helpers (`correction-diff.ts`, `recurrence-label.ts`) exist.
- The seams this feature calls already exist:
  - F15: `PlanActivityStateService` (`resolveForOwner`, `markStarted`, `markCompleted`) and the two empty activity route registries;
  - F12: `ProfileIngestionService.ingestActivityOutcome` and `ErrorLedgerReader`;
  - F04: `PromptExecutionService` and the prompt loader;
  - F02: `CredentialsService`;
  - F11: `ErrorTaxonomyService`.
- The migration takes the next free number at implementation time: `0016` on today's `main`, unless another Wave 12 feature (F16, F18, F20) lands first.
- No new dependency and no new environment variable. Mobile already has `shared_preferences`.
- Docker must be available for Testcontainers.
- There is no mockup for the writing screen. Before building the Flutter screen, read the `mobile-ui` skill (step 3: compose from `Eq*` widgets), and follow the web screen built in Stage 5.
- For the live check only, you need a seeded user with a real Gemini key and an active plan that holds a writing activity. The automated suites fake Gemini.

---

### Stage 1: Contracts, Rules and Data Model

**1. Shared Writing Contracts, Constants and Word Counter** - Add the writing contracts to the shared package: the activity view, task, draft, correction, segments, error groups, limit, the draft and submit inputs, and the conflict and limit error details. Add the fixed writing constants, the single word-counting rule and its test table, and the seven `WRIT` error codes with their messages, then rebuild the package.

**2. Writing Task Rules File** - Author the versioned writing task rules file with its scenarios across the C1 genres, one requirement sentence per analysis-family tag, the general requirement and the closing line. Load it when the API boots, following the study plan rules pattern: the invariants, the taxonomy coverage check, proof that every scenario and tag combination lands within 80–150 words, a refusal to start on an invalid file, and a fingerprint pinned per version.

**3. Data Model and Migration** - Add the writing tasks, correction requests and correction errors tables, with the migration, constraints and partial indexes the specification gives. Mirror them in the Prisma schema with their relations to users and plan activities.

---

### Stage 2: Task Composition and Drafts

**4. Task Composer** - Implement the pure composition of a task from the activity's target tags, the owner's ranked unmastered analysis tags, their recent scenarios and the rules. It re-targets when needed, falls back to a general task, avoids recent scenarios, and is deterministic for the same activity lineage.

**5. Writing Repository** - Implement persistence for tasks, drafts, correction requests and their errors. That covers task lookup across an activity's carry-over lineage under a row lock, the compare-and-set draft update, the lease claim, and the rolling-window count, each able to join a caller's transaction.

**6. Opening and Reading an Activity** - Implement opening a writing activity. It resolves the activity through the plan's state contract, checks its kind and plan status, composes and stores the task on the first open, and marks the activity started. Add the read model that builds the caller's own view from the task, its corrections, the Gemini key status and the limit state.

**7. Draft Saving** - Implement the server draft save: revision checking, idempotent handling of a retried identical save, the conflict response carrying the server copy, locking while a text is being corrected or once it has been corrected, the return to draft after a failed correction, and the accumulation of time spent.

---

### Stage 3: Correction

**8. Correction Prompt, Version 2** - Rewrite the writing correction prompt to the specification's variables, response schema, scoring guidance, constraints and examples. Add the renderer for its variables, which only ever uses the owner's own task and text. Add the boot check that refuses to start when the prompt, the renderer and the taxonomy disagree, and wire it into the boot sequence after the plan prompt check.

**9. Correction Output Rules** - Implement the pure output rules. Locate each quote verbatim in the submitted text, and cap, discard, de-duplicate and order the errors. Build the highlight segments, the whitespace-preserving revision segments (reusing the lesson result's correction diff), the error groups with their recurrence badges, and the mapping of a correction onto the profile's outcome contract.

**10. Submission** - Implement submission. Run the ordered checks for ownership, idempotency, plan status, task status, revision, length and the Gemini key. Enforce the rolling daily limit under a per-user lock, create the correction request, move the task to correcting, and start the correction without awaiting it.

**11. Correction Runner and Recovery Sweep** - Implement the background correction on the owner's key. Classify failures, retry once after a request failure, and settle the correction in one transaction:
- on success, store the result, ingest the errors and scores into the profile, and complete the plan activity;
- on failure, keep the text and record the failure state, with the raw response retained for invalid output.

Add the periodic sweep that reclaims corrections whose lease expired, and make sure a result is stored only once.

---

### Stage 4: HTTP Surface

**12. Writing Routes and OpenAPI** - Add the open, read, draft and submit routes with their OpenAPI decorators and error responses, and the error factories. Register the view, input and error-detail components and the `writing` tag, register the module, and regenerate the committed OpenAPI snapshot.

---

### Stage 5: Web

**13. Text Area and Dialog Primitives** - Add the text area and modal dialog primitives to the design system, with labelling, keyboard and focus behaviour. Show both in the design-system gallery.

**14. Web Data Layer and Draft Autosave** - Add the browser calls for the writing routes, the guarded local draft store, the pure reconciliation between the local and server copies, and the draft hook. The hook saves locally and to the server on the specified cadences, flushes when the page is hidden, counts visible time, and enters the conflict state when a save is rejected.

**15. Writing Editor Screen** - Build the writing screen from the design-system primitives: the collapsible task card, the full-height editor, the live word counter and saved indicator, and the missing-key, limit and failure notices. Add the conflict banner with the local version, the submission confirmation, the checking state with polling, and the loading, not-found and read-only states.

**16. Correction Result View** - Build the result view: the overall comment, inline highlights whose details open on click or hover, the toggle to the revised version with its changes emphasised, the four score meters, and the error list grouped by tag with recurrence badges and ledger links.

**17. Web Route and Registration** - Add the writing page under the plan's routes and register the writing kind in the activity route registry, so `Start session` and the plan's activity links open it.

---

### Stage 6: Mobile and Follow-Ups

**18. Mobile Models, API and Local Store** - Mirror the writing contracts in Dart and add the writing API client. Add the word counter and the reconciliation, each sharing the web's test table, and the local draft store on the device's preferences.

**19. Writing Controller** - Add the controller that loads and opens the activity, runs the local and server autosave and the polling while correcting, flushes on pause and reconciles on resume, handles conflicts and notices, and submits.

**20. Writing Page and Widgets** - Build the writing page and its widgets, following the mobile UI guide: the task card, the editor with its counter bar kept above the keyboard, the notices and the conflict banner. Add the confirmation and error detail sheets, the checking view, and the result view with highlights, the revised toggle, the meters and the grouped errors.

**21. Mobile Route and Registration** - Add the writing route inside the Plan tab and register the writing kind in the mobile activity route registry, so Today and Plan open it.

**22. Follow-Up Notes in Finished Features** - Record dated follow-up notes in the progress files of the features whose seams this one uses or extends:
- F04's replaced correction prompt;
- F12's first activity caller;
- F15's registered route and state contract use;
- F19's exported diff helper.

Add the writing correction bullet to the prompt authoring rule.
