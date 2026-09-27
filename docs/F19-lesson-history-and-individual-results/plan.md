# Implementation Plan: Lesson History and Individual Results

**Prerequisites:**
- F06 to F11 are implemented. Branches rest at `profile_update` / `queued` after analysis, and every route F19 composes is live: `recording` and its retry, `pipeline` and its retry, `transcript`, `pronunciation` and `analysis`. F21's primitives and F03's shell (with its `Lessons` placeholder tab) are in place.
- F12 is in the same wave and its spec already adopts F19's `ErrorLedgerPort` contract. F19 depends only on that seam, which it adds itself (or finds in place if F12 landed first), and the recurrence badge stays hidden until F12 implements it. The two specs also share the meter and chip mirrors, the relative-time formatter, the header pill order and the `plan_generation` stage label: whichever feature lands first creates each of them, and the other reuses it.
- Docker Desktop must be running, both for the stack and for Testcontainers. Start the dev servers with polling, as `AGENTS.md` describes, and seed the accounts from `SEED_USERS`.
- No new runtime dependency, no environment variable and no migration. Flutter 3.44 and Dart 3.12 for `apps/mobile`. There is no emulator run unless the user asks.
- `docs/api/openapi.json` is regenerated whenever a route or contract changes. If the `tsx`-based `openapi:generate` script crashes silently (the F10/F11 follow-up), generate through `pnpm build` and `node dist/openapi/generate.js`.
- No mockup exists for these screens. Consider generating a Stitch mockup for the list and the result area before Stage 3. Without one, both clients compose from the design-system primitives, as the spec records.
- The working tree holds unrelated mobile work in progress (`apps/mobile/lib/app_module.dart`, `lib/core/config/app_config.dart`). Leave it untouched, and stage explicit paths only.

---

### Stage 1: Contracts and route extensions

**1. Shared contracts** - Add the history contract: the six statuses and three flags with their labels, the lesson summary, the paginated list and its query, the detail view with the scenario step and the other participants' coarse stages, and the stage labels (including `plan_generation` if F12 has landed). Extend the scenario, analysis, pronunciation and excerpt schemas with the past-lesson scenario view, the correction segments and recurrence, the overall pronunciation score, and the assessed words. Rebuild the shared package.

**2. Ledger seam** - Add the error-ledger port beside the profile-tags port, with its neutral default, and export it from the profile module, so the analysis view can ask for recurrence counts that F12 later provides.

**3. Analysis view extensions** - Implement the pure correction diff and the ordinal recurrence label, and have the analysis view carry both on every error. Add the analysis reader's score timeline for the history service.

**4. Pronunciation and transcript extensions** - Implement the pure word bands and word projection. Give the pronunciation result its rounded overall score with a delta against the caller's previous assessed lesson, and add the pronunciation reader's previous-result and score-timeline reads. Put the assessed words on the caller's own transcript badges, leaving other participants' lines untouched. Extend the three route suites.

### Stage 2: Lesson history API

**5. Status, headline and cursor rules** - Implement the pure status derivation with its precedence table and flags, the coarse stages for other participants, the per-lesson delta timeline with the headline text, and the opaque cursor, each with its unit suite.

**6. History routes** - Build the lessons module with its service and controller. The list is newest first, keyset-paginated and batch-loaded, with statuses, flags, active stage, reason, headline and storage. The detail carries the same summary plus the scenario step and others' coarse stages. Add OpenAPI decorators, the history fixtures helper and the route suite, including the retry-reuses-upstream and cross-route consistency checks.

**7. Past-lesson scenario route** - Extract the scenario view builder so the open-lesson view and the new lesson-scoped view share the rule that only the caller's own card is ever read. Expose the lesson scenario route with its decorators and suite, keeping F06's suites green.

**8. Privacy suite and OpenAPI document** - Add the suite that calls every lesson route as each participant and asserts that nothing private of the other appears, that no audio object is exposed and that no export route exists. Register the new components and tag, and regenerate the committed specification.

### Stage 3: Web lesson history

**9. Web data layer and formatting** - Add the server-side reads that return a result or an error code for every route the pages compose, the browser-side calls for the next page and both retries, and the date, duration, clock, elapsed-time and size formatters with their case table, taking relative dates from the formatter shared with F12.

**10. Primitive extensions** - Let the meter render a missing previous result as a dash, and give the pill navigation an accessible label, an always-visible mode and prefix matching. Show the new meter state in the component gallery and regenerate the affected visual baselines.

**11. Lesson list, navigation and dashboard** - Build the list route with its rows, status badges and flag chips, `Load more`, the storage line, auto-refresh, and the loading, empty and error states. Add `Lessons` to the header pill in the order the spec gives with F12's Profile, and the recent-lessons block to the dashboard. If F12 has landed, make the error-card tag chip open its ledger detail.

**12. Lesson detail frame and result area** - Build the detail layout with its header, section navigation, not-available state and auto-refresh. Build the result area: the status panel while analysis is not ready, the six meters, strengths, errors grouped by severity with emphasized corrections and recurrence badges, scenario fit, recurring tags, topics and the pronunciation section, with links into the transcript.

**13. Scenario and transcript areas** - Render the past scenario with the situation card in read-only mode and the caller's own role card. Render the merged transcript with its speaker legend, clock margin, excerpt badges that expand to banded word colouring and the selection reason, and anchor highlighting.

**14. Status area and retries** - Build the caller's stepper from the pipeline and recording views: states, elapsed and completed durations, the progress count, reasons, settings links, captured duration and retry through the right route with its error handling. Add a coarse stepper for every other participant.

**15. Design reference update** - Name `Lessons` in the header pill row of `design/README.md`, and add the dashboard note recording the recent-lessons block and the PRD clause that requires it. Keep the design-reference guard green.

### Stage 4: Mobile lesson history

**16. Mobile design widgets** - Add the meter and chip mirrors of the web primitives with their widget tests (or extend them if F12 landed first), and the tab bar theme in the app theme, so the detail tabs render in the product's style rather than stock Material.

**17. Dart models and transport** - Write the hand-written models for the list, the detail, the past scenario and every composed view, including F19's extensions, with the unknown-stage fallback. Add the transport for every read and both retries, and the formatter mirroring the web's case table, with relative dates from the shared formatter.

**18. Lesson list screen** - Replace the placeholder with the lessons module and its list screen: rows with status badges and flag chips, infinite scroll, pull-to-refresh, polling while needed, the storage line, and the three page states, verified on a small phone and at large text.

**19. Lesson detail screen** - Build the pushed detail screen with its header and the four tabs, carrying the same content and order as the web areas, including tab switching with scroll-to-utterance, the settings links and both retries. Verify it on a small phone and at large text, with no audio control on any tab.

### Stage 5: Verification and hand-off

**20. Live verification** - Run the spec's live checklist on the local stack: scratch lessons in every status for both seeded users, the three new routes and the privacy spot check through the running API, every web page and a real retry in the browser pane in both themes and at phone width, and the analyzer, test suite and debug build for mobile. Record every outcome and soft-fail, then delete the scratch data.

**21. Follow-ups for neighbouring features** - Append dated notes to the progress logs of F07, F08, F09, F10 and F11 (their client surfaces now exist, along with the additive route changes) and of F22 (the header pill now carries `Lessons`). Confirm that the spec's notes for F12, F15 and F20 still match what was built, and correct them where the implementation differs.
