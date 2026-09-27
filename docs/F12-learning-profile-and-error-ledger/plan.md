# Implementation Plan: Learning Profile and Error Ledger

**Prerequisites:**
- F10 and F11 are implemented. Analysed branches wait at `profile_update` / `queued`, `LessonAnalysisReader` and `PronunciationResultReader` return each participant's results, and `ProfileTagsPort` (F06, F11) and `PronunciationFocusPort` (F09) still return their neutral values.
- Docker Desktop must be running, both for the stack and for Testcontainers. The integration suites use the Postgres, Redis and MinIO containers the F08–F11 suites already start.
- No new runtime dependency, no new environment variable, no prompt change and no design token.
- The taxonomy YAML is read only at boot: restart the API after editing it.
- The first boot with F12 profiles every branch already waiting at `profile_update` in the local database, and the reconciliation job ingests every pronunciation result. Neither calls a provider, but the live check records the counts before and after.
- The live checks use the seeded user's already-stored Gemini and Azure keys. The role-card check spends one scenario generation.
- `docs/api/openapi.json` is regenerated whenever a route or contract changes, per the project's OpenAPI directive. If the `tsx`-based `openapi:generate` script crashes silently (the F10 and F11 follow-up), generate through `pnpm build` instead.
- Mobile work follows `apps/mobile/AGENTS.md` and the `mobile-ui` skill, and the screen has no mockup. The working tree carries unrelated uncommitted changes in `apps/mobile/lib/app_module.dart` and `apps/mobile/lib/core/config/app_config.dart`. F12 does not touch either, and stages only explicit paths.

---

### Stage 1: Contracts, taxonomy and data model

**1. Shared contracts** - Add the profile contract: the six competencies, trends, the ledger states, the ledger entry and example views, and the profile, ledger list and ledger detail views. Add `plan_generation` to the pipeline stage vocabulary (with its `Plan generated` label, if F19 has already added the stage labels) and the ledger-entry-not-found error code. Rebuild the shared package.

**2. Taxonomy version 2** - Confirm the phoneme symbols Azure actually emits against the local assessments, then add the phoneme family with its labelled tags and bump the taxonomy version. Extend the loader with per-family tag formats and the service with the lookups the spec lists, and pin the new fingerprint. Keep F11's analysis tags and boot check untouched.

**3. Data model and migration** - Add the seven profile and ledger models and widen the stage checks for `plan_generation`. Write the migration with the constraints and indexes the spec lists, apply it locally, and regenerate the Prisma client on the host and in the container.

**4. PRD alignment** - Update F12's taxonomy sentence in the PRD so it describes the three analysis families plus one phoneme tag per en-US phoneme, as the spec records.

### Stage 2: Profile engine

**5. Scoring and ledger rules** - Implement the pure fold that turns an ordered measurement log into smoothed scores, deltas, trends and sub-scores. Implement the pure ledger rules for aggregates, the Core lifecycle state, the tag trend and the recurring-weakness selection.

**6. Ingestion contract and service** - Define the source and activity-outcome input contracts. Build the ingestion service that locks the user's profile, then skips, applies or replaces a source, rejects and logs unknown tags, and recomputes the affected scores and ledger records in one transaction. Expose the activity entry point and the rebuild operation.

**7. Readers and compact summary** - Build the profile reader (snapshot, measurement history, partial-update note) and the ledger reader (entries, detail, unmastered and due tags, recurring weaknesses). Build the compact summary renderer and its service within the token budget.

### Stage 3: Lesson ingestion and seams

**8. Lesson source mapping** - Implement the pure mapping from F11's analysis and F10's pronunciation result to profile sources, with their revisions, measurements and occurrences.

**9. Profile update stage and pipeline order** - Implement the `profile_update` stage as the spec's flow describes, applying both lesson sources inside the completing transaction, and register it in its own module. Append `plan_generation` to the pipeline order, wire the module into the app, and add the stage's integration suite.

**10. Reconciliation job** - Add the interval job that ingests pronunciation results the profile has not applied yet, so the pronunciation dimension updates while an analysis is blocked or failed, and lessons processed before F12 are backfilled.

**11. Profile seams** - Replace the profile tags port with the owner's recurring analysis-family tags. Move the pronunciation focus port into the profile module and implement it from the owner's unmastered phoneme tags and observed word phonemes, then repoint the excerpt selection module at it. Implement the error-ledger port F19 reads for its recurrence badge, creating the port if F19 has not landed yet.

**12. Adapting earlier suites** - Move the F11 and drain assertions that expected branches resting at `profile_update` onto `plan_generation`. Update the excerpt-selection suite's focus override for the moved port, and give the pipeline fixtures the profile helpers and the new retry override. Run every pipeline suite green again.

### Stage 4: Routes and document

**13. Profile routes** - Expose the caller's profile, ledger list and ledger detail views with server-built notes, rounding and labels. Put OpenAPI decorators on every route, and add the route suite, including the privacy and not-found checks.

**14. OpenAPI document** - Register the three new components and the profile tag, and regenerate the committed specification.

### Stage 5: Web profile screen

**15. Navigation and design reference** - Add the Profile destination to the header navigation in the order the spec gives with F19's Lessons, and update the pill-navigation rows of the design reference to match. Add the relative-time formatter shared with F19, or reuse it if F19 landed first.

**16. Profile screen** - Build the profile page and screen: the server-side read, the loading, empty and error states, the notes, the six meters with the Pronunciation disclosure, and the recurring weaknesses rows. Use only design-system primitives and tokens.

**17. Ledger detail dialog** - Build the dialog a weakness row opens, with its own loading and error states, the examples linked to their lessons and the sources list, keyboard-operable end to end. Let the profile page open a tag's detail from the address, and point F19's error-card tag chip at it if F19 has landed.

### Stage 6: Mobile profile screen

**18. Mobile primitives** - Add `EqMeter` and `EqChip` mirroring the web primitives' props and tones, and the relative-time formatter with the same bands as the web, or reuse them if F19 landed first.

**19. Profile models and controller** - Add the hand-written Dart models mirroring the three shared views, and the controller that loads the profile and a ledger record's detail.

**20. Profile page and detail sheet** - Replace the Profile tab's placeholder with the real screen and its three page states, the expandable Pronunciation tile and the weakness rows, plus the bottom sheet for a record's examples and sources. Open that sheet from F19's error-card tag chip if F19 has landed.

### Stage 7: Verification and hand-off

**21. Live verification** - Run the spec's live checklist on the local stack with the seeded user's keys: taxonomy symbols, backfill, a scratch lesson end to end, the blocked-analysis path, the role card, and the web screen in both themes. Record every outcome and soft-fail, then delete the scratch data and rebuild the user's profile.

**22. Follow-ups for neighbouring features** - Append dated notes to the progress logs of F11 (the stage it hands to now runs, and the adapted suites), F09 (the focus port moved and implemented), F06 (the tags port is real, and its recurring-weakness criterion is testable) and F22 (the Profile pill supersedes "exactly Dashboard and Settings"). If F19 has not landed, record in F19's spec notes what it must wire: the tag chip and the recurrence badge through the implemented port. Confirm that the spec's notes for F14 through F20 still match what was built, and correct them where the implementation differs.
