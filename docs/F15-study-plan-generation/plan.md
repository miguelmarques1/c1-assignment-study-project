# Implementation Plan: Study Plan Generation

**Prerequisites:**
- F02, F04, F07, F08 (the pipeline runner), F12 (Core), F13, F14, F19, F21 and F22 implemented. All report `success` on today's `main`
- F14's `ContentGenerationService.generateForPlan`, its `classifyGenerationError` and its fake-Gemini `generationResponder`. F13's `ContentBankService`. F12's `ErrorLedgerReader`, `LearningProfileReader` and `ProfileSummaryService`. F08's `PipelineStageRegistry`, `PipelineStateService` and `PipelineService.retry`
- The migration takes the next free number at implementation time (`0015` on today's `main`)
- No new dependency and no new environment variable
- Docker available to Testcontainers
- Before building a screen, read the dashboard table in `design/README.md`, the `english_quest_dashboard` mockup, and, for Flutter, the `mobile-ui` skill
- A seeded user with a real Gemini key and at least one profiled lesson, for the live check only. The automated suites fake Gemini

---

### Stage 1: Contracts, Rules and Data Model

**1. Shared Plan Contracts and Error Codes** - Add the plan contracts to the shared package (activity kinds and states, plan status and origin, difficulty rating, notes, the activity, session, plan, current-plan and history views) and the four `PLAN` error codes with their messages. Add the terminal `completed` status to the pipeline's branch status, then rebuild the package.

**2. Study Plan Rules File** - Add the versioned study plan rules file with the session shape, the estimates, the quotas, the task slots and their days, the carry-over cap, the candidate and model limits, and the generation cap. Load it at boot, following the generation rules pattern, with its cross-field invariants, a refusal to start on an invalid file, and a pinned fingerprint per version.

**3. Data Model and Migration** - Add the plans, plan activities and plan requests tables with the migration the specification gives, including every constraint and partial index, and widen the branch status check with the terminal status. Mirror them in the Prisma schema with the relations to users, lessons, content items and generation runs.

**4. Terminal Branch Status** - Make the pipeline's completing transaction move the branch pointer to the terminal status when the completed stage is the last one, and update the stage-order documentation. Confirm that the lesson history still derives `Ready` for a branch that has finished.

---

### Stage 2: Composition Core

**5. Estimates and Tag Priority** - Implement the pure minute estimates per activity kind from item metadata and the rules, and the tiered ranking of the user's unmastered tags across every family, pronunciation included, carrying each tag's source and lesson sightings.

**6. Candidate Ranking and Model Output Validation** - Implement candidate eligibility (level, and target tags against the unmastered set, or level alone in general mode), the deterministic ranking key, and the aliased offer list built from metadata only. Implement validation of the model's selection: unknown, duplicate and off-target entries rejected, the discard rule, the rationale acceptance and the per-reason counts.

**7. Plan Selection** - Compose the selection from the validated model output or from the ranking alone: the model's order first, then the deterministic interleave by kind with the per-tag limit. Pin the listening and reading minimums, and add the writing, pronunciation and speaking task slots with their target tags. Flag review activities, build the notes in their fixed order, and pick the focus tags.

**8. Carry-Over and Session Packing** - Implement carry-over selection from the replaced plan's unfinished activities whose tags are still unmastered, and the deterministic packer: carry-over first, tasks on their days, pinned quota items, ranked items into the best-fitting session, filler tasks when a session falls short, the order within each session, and the pass that enforces the review cap.

**9. Rationale, Summary Line and Precedence** - Implement the rationale templates keyed on each activity's primary tag and its evidence, the summary line with its focus tags, and the precedence ordering of plans by lesson time and origin.

---

### Stage 3: Composition Service and Prompt

**10. Additive Reads on Finished Features** - Add the lesson-sightings read to the error ledger reader and the metadata lookup by known ids to the content bank service, each as a new method that leaves existing behaviour untouched.

**11. Composition Prompt, Version 2** - Rewrite the composition prompt to the specification's variables, response schema, constraints and examples, and add the renderer for its variables so only candidate metadata and the owner's own profile data reach it. Add the boot check that refuses to start when the prompt and the composer disagree, and wire it into the boot sequence after the generation prompt check.

**12. Plan Composer** - Implement the orchestration that gathers the owner's profile inputs and Gemini status, runs the content generation batch once per plan with its run key and progress callback, builds the pool and offer, calls the composition prompt on the owner's key, classifies failures into deterministic reasons, and returns the composed selection with its prompt stamp and statistics.

**13. Supersession and Activation** - Implement the check that skips a build outranked by an existing plan or by a newer analysed lesson before anything is spent. Implement the activation transaction: the per-user lock, idempotency per lesson and origin, precedence against the active plan (archiving on arrival when outranked), carry-over, packing, archiving the previous plan, inserting the new one, and recording servings.

---

### Stage 4: Triggers and Activity State

**14. Plan Generation Stage** - Register the `plan_generation` stage handler, which never blocks and has its own retry policy. It completes as superseded or already done where that applies. Otherwise it composes with progress reported on the stage, and activates the plan inside the stage's completing transaction.

**15. Fallback and Interim Plan Requests** - Implement the recording fallback seam so that it records a plan request and is awaited by the finalizer. Add the request job: it discovers fallback requests recorded before this feature and analyses blocked on a Gemini key, claims requests with a lease and one per user, composes them (deterministically for the interim plan), activates them, and retries, fails or supersedes them as the specification describes.

**16. Activity State Contract and History Reader** - Implement the internal contract later runners call to start, complete, skip and rate an activity: owner checks, forward resolution through carry-over, idempotent completion, the archived-plan rule, and session and plan progress in the result. Add the completion history reader that the history route and F20 share.

---

### Stage 5: HTTP Surface

**17. Plan Read Service and Retry** - Implement the current-plan view with its preparing and failure states derived from pipeline stages and requests, the history view with its statistics, and the single-plan view, all scoped to the caller. Add the retry that sends a pipeline build back through the pipeline's own retry and resets a failed request.

**18. Plan Routes and OpenAPI** - Add the four plan routes with their OpenAPI decorators, register the three view components and the `plans` tag, add the error factories, register both new modules, and regenerate the committed OpenAPI snapshot.

---

### Stage 6: Web

**19. Web Data and Selection Helpers** - Add the server-side reads for the current plan, the history and a single plan, the browser retry call, the today-session selection that uses the device's local date, and the empty route registry that decides whether an activity can be opened.

**20. Plan Components and Icons** - Build the plan components from the design-system primitives: the activity card with its rationale disclosure and chips, the kind icon and state badge maps, the preparing and failure banner, the notes, the expandable day, the session summary and the history list. Add the writing, vocabulary and grammar icons to the icon set and the design-system gallery.

**21. Plan Pages and Navigation** - Add the `/plan` page and the read-only `/plan/[planId]` page with their loading, empty and error states and polling while a plan is being prepared. Add the `Plan` pill to the header in the mobile tab order.

**22. Dashboard Today Card and Design Reference** - Build the `Today's session` card in the daily-lessons mockup card's visual language and place it on the dashboard in place of the placeholder text, with every state the specification lists. Update the design reference: the new pill destination, the daily-lessons card as implemented, and the module grid header still deferred.

---

### Stage 7: Mobile and Follow-Ups

**23. Mobile Models, API and Controllers** - Mirror the plan contracts in Dart, add the plans API client, and add a shared current-plan controller that polls only while a plan is being prepared and can retry. Mirror the today-session selection and the empty route registry, and add the terminal branch status to the pipeline models.

**24. Today and Plan Tabs** - Replace the Today and Plan placeholders with the real screens, following the mobile UI guide: today's session with its summary and actions, the plan's summary, notes and expandable days, and the history and read-only detail pages with their routes. Remove the placeholder page if nothing uses it anymore.

**25. Follow-Up Notes in Finished Features** - Record dated follow-up notes in the progress files of the features whose seams this one filled or extended: the recording fallback port, the pipeline's terminal status, the ledger and content bank additions, the generation consumer and the lesson history stepper. Add the composition prompt bullet to the prompt authoring rule.
