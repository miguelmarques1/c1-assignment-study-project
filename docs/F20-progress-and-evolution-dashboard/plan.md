# Implementation Plan: Progress and Evolution Dashboard

**Prerequisites:**
- F03, F12, F15 and F21 are implemented (F06's and F15's data are only read by the Full Scope). F12's `LearningProfileReader.measurementHistory`, `ProfileService.getProfile`, the ledger detail route and both clients' weakness list and detail sheet are live. F16, F17 and F18 are in the same wave. F20 needs nothing from them: until they ship, activity points come only from test seeding through F12's `ingestActivityOutcome`.
- Docker Desktop must be running, both for the stack and for Testcontainers. Start the dev servers with polling, as `AGENTS.md` describes, and seed the accounts from `SEED_USERS`.
- No new runtime dependency, environment variable, migration or error code. The token layer changes, so run `pnpm tokens:build` after editing `tokens.json`. In a `core.autocrlf=true` checkout, the drift guard can fail on line endings alone (the F12 and F19 follow-up), and a fresh build restores LF. Flutter 3.44 and Dart 3.12 for `apps/mobile`. There is no emulator run unless the user asks.
- `docs/api/openapi.json` is regenerated whenever the route or contract changes. If the `tsx`-based `openapi:generate` script exits silently (the F10–F19 follow-up), generate through `pnpm build` and `node dist/openapi/generate.js`.
- No mockup exists for the progress screen. Consider generating a Stitch mockup before Stage 2. Without one, both clients compose from the design-system primitives, as the spec records.
- Running the `visual` Playwright service recreates the `web` and `api` containers, so restart the dev servers afterwards. Run the baselines serially.
- Leave unrelated work in progress in the working tree untouched, and stage explicit paths only.

---

### Stage 1: Tokens, contract and the progress route

**1. Chart colour roles** - Add the six categorical chart roles to the token source for both themes, with a contrast pair against the card surface for each, and regenerate the CSS, TypeScript and Dart outputs. Record the categorical order and its reasoning in the design system's reference document.

**2. Shared contract** - Add the progress contract: the range and its boundary, the measurement source kind, the history point and series, the history block and the dashboard view that embeds the existing learning-profile view. Export it from the barrel and rebuild the shared package.

**3. Progress route** - Export F12's profile service from its module, and add the progress module with the pure history assembly, the service that combines the embedded profile with the six per-competency history reads, and the controller with its OpenAPI decorators. Register the module, the component and the tag, and regenerate the committed specification.

**4. Route behaviour and privacy** - Prove the assembly rules and the route against real data: the newest-twenty window, rounding, range boundaries, the chartable rule, equality with the profile route, activity points arriving through F12's contract, and the absence of any other participant's data.

### Stage 2: Web progress screen

**5. Chart model** - Implement the pure chart model the spec's table defines (range filtering, domain, positions, ticks, markers, series roles, moments, nearest moment, legend toggling and the summary sentence), with the case table the mobile twin will repeat.

**6. Segmented control primitive** - Add the segmented control to the web primitives with radio-group semantics and keyboard operation, show it in the component gallery, and regenerate the gallery's visual baselines.

**7. Data layer and route** - Add the server-side read and the browser retry for the progress view, and the progress route under the profile with its loading skeleton and page title.

**8. Chart card** - Build the plot renderer at measured width, with gridlines, ticks, lines, markers, the crosshair tooltip and keyboard stepping. Build the legend tiles that carry the snapshot and toggle lines, the source key, the table view and the three chart empty states, all from token classes.

**9. Progress screen and navigation** - Compose the screen: back link, heading, notes, the chart card, and the recurring weaknesses with F12's rows and detail dialog, together with the loading, empty and error states. Add the entry card to the profile screen, and keep the profile pill active on its sub-page.

### Stage 3: Mobile progress screen

**10. Dart models and chart model twin** - Write the hand-written models mirroring the progress contract, reusing the profile view's model, and the Dart twin of the chart model with the same case table as the web.

**11. Segmented control widget** - Add the segmented-control mirror to the design widgets, with the web's prop names, touch-sized targets and selection semantics.

**12. Chart and legend widgets** - Build the chart palette, the painter-based plot with tap and drag selection of the nearest moment and its readout, the legend tiles, the source key and the list view, matching the web's marks, rules and copy.

**13. Progress screen and routing** - Turn the Profile tab into a module with the progress route pushed on top, extract the weakness row for reuse, and add the entry card to the profile screen. Build the progress screen with its controller, pull-to-refresh and the three page states, verified on a small phone and at large text.

### Stage 4: Design reference, verification and hand-off

**14. Design reference and live verification** - Record the two statistic-card decisions and the profile pill's prefix match in the design reference, keeping its guard green. Run the spec's live checklist on the local stack (seeded data, the route as both users, the web screen in both themes and at phone width, the mobile analyzer, test suite and debug build) and record every outcome, then remove the scratch data.

**15. Follow-ups for neighbouring features** - Append dated notes to the progress logs of F12 (its profile service is exported and embedded in the progress view, and recent improvements wait on its Full Scope) and of F22 (the statistic cards are settled). Record the open F20 Full Scope items and the recent-improvements region as this feature's follow-ups.
