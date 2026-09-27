# Implementation Progress: Learning Profile and Error Ledger

**Status:** success
**Branch:** claude/learning-profile-error-ledger-44d9aa
**Started:** 2026-09-25
**Last updated:** 2026-09-27

**Run setup:** the worktree branch was fast-forwarded to `main` (`f90378a`, F11 closed) before the run, and `spec.md` / `plan.md` were copied in from the main checkout, where they were untracked. F19 is implemented concurrently in another worktree on the same base, so this run takes F12's "F19 has not landed" path everywhere the spec offers one, and leaves the shared `english-quest` compose stack (which bind-mounts the main checkout) untouched: integration suites run on Testcontainers, and live checks use an isolated stack or read-only queries.

## Stage 1: Contracts, taxonomy and data model — ✅ done

- [x] **1. Shared contracts**
- [x] **2. Taxonomy version 2**
- [x] **3. Data model and migration**
- [x] **4. PRD alignment**

**Observations:**
- `packages/shared/src/schemas/profile.ts` is new with every schema the spec lists, plus two it implies: `competencySubScoresViewSchema` (the Pronunciation `subScores` object, named so the OpenAPI component and the Dart model have a type to mirror) and `ledgerListQuerySchema` (`tag`, 3–64 characters, the list route's `VAL001`). `ledgerSourceKindSchema` (`lesson` / `activity`) is shared by the example and source views. `pipeline.ts` gained `plan_generation`; `codes.ts` gained `PROF001` (404, `This error record could not be found.`). No client references a stage name yet (F19 adds the labels), so nothing else needed the new stage.
- **Taxonomy symbols confirmed live, not from the local database:** the dev database holds no `lesson_excerpt_assessments` rows at all (every earlier live check deleted its scratch lessons), so the spec's "confirm against the local assessments" had nothing to read. Instead, one real Azure pronunciation call (`TEST_AZURE_SPEECH_*` from `.env`, the F10 precedent) on an offline Windows TTS clip written to cover the inventory, through the project's own `PronunciationAssessmentClient`, with a throwaway script deleted afterwards. It returned 40 distinct symbols; a second short clip ("I like my time…") returned the missing `aɪ`. All 41 match the spec's list exactly, and the two open code points resolve as: **`g` is ASCII U+0067** (not `ɡ` U+0261), and `ɝ` (U+025D) and `ɚ` (U+025A) are both emitted. `ɹ` is U+0279.
- `error-taxonomy.yaml` is v2: family `phoneme` (label `Pronunciation`, `analysis: false`, `format: ipa`) with 41 tags labelled `/θ/ as in "think"` and a one-sentence description each; 77 tags in total. The header comment was rewritten (it still promised a `pronunciation` family and cited the slug-only pattern).
- The loader validates each tag against its family's format (`slug` `^[a-z]+:[a-z0-9-]+$`, `ipa` `^[a-z]+:/[^/\s]{1,4}/$`). Families gain a resolved `format` (default `slug`), and the loaded result gains `familyOf: ReadonlyMap<tag, family>`. **Fingerprint:** `format` joins a family's tuple only when it isn't `slug`, so v1's pinned fingerprint is still what v1 hashes to; v2 is pinned at `0b04072773…`. `the_analysis_tags_are_unchanged_by_v2` proves more than the spec asked: v2 minus the phoneme family hashes to v1's exact pin, so the three analysis families are byte-identical to v1 (F11's prompt `enum` and boot check untouched).
- `ErrorTaxonomyService` gained `has`, `familyOf` (null for unknown or retired) and `tagsInFamily`.
- Migration `0012_learning_profile` is the spec's SQL verbatim. The two stage checks' names were confirmed against `0011` (`ck_stages_stage`, `ck_branches_stage`). **Deviation (FK names):** the spec asks for `fk_*` names, but every earlier migration declares foreign keys inline and lets Postgres name them `<table>_<column>_fkey`, which is also Prisma's default `map`; the spec's own SQL block is inline too. Kept the codebase's convention, so `schema.prisma` needs no `map:` on any relation.
- `schema.prisma` gained the seven models and the back-relations on `User`, `Lesson` and `LessonUtterance`. `prisma format` was deliberately **not** run: it realigns 134 lines of unrelated models. `updated_at` on the new tables is `@default(now())` and written explicitly by the engine, not `@updatedAt`.
- **Migration not applied to the shared dev database** — deliberately. F19 runs concurrently against the same `english-quest` stack (which bind-mounts the main checkout, not this worktree), and applying `0012` there would put a migration in `_prisma_migrations` that the main checkout's code does not have. The migration is proven by Testcontainers instead (every integration suite applies every migration from scratch; `health.spec.ts` ran green with it), and the live checks in stage 7 use an isolated stack. The container-side `prisma generate` step is moot for the same reason.
- PRD: F12's taxonomy sentence now reads "about 40 grammar, vocabulary and discourse tags, plus one pronunciation tag for each en-US phoneme Azure reports", with `phoneme:/ɹ/` in place of the `stress:word-level` example (A13, A14).
- `docs/api/openapi.json` regenerated now, since the stage enum and the error-code list changed (F10/F11 precedent). The `tsx` script still exits 1 silently (the `emitDecoratorMetadata` gap F10 recorded); generated through `pnpm build` + `node dist/openapi/generate.js`. Diff: `plan_generation` in three enums, `PROF001` in the code list.
- Setup noise: `pnpm --filter @english-quest/design-tokens tokens:build` (needed in a fresh worktree) rewrites the three generated token files with LF endings; they were restored, not committed.

**Validation:** typecheck ✅ (all 4 projects) · lint ✅ · API unit 258/258 ✅ (`openapi.spec.ts` failed once on the stale snapshot, green after regenerating) · `error-taxonomy.spec.ts` 13/13 ✅ · `health.spec.ts` (Testcontainers, applies `0012` from scratch) 4/4 ✅
**Commit:** `c3d73ba` F12 spec/plan and stage 1 - contracts, taxonomy and data model

## Stage 2: Profile engine — ✅ done

- [x] **5. Scoring and ledger rules**
- [x] **6. Ingestion contract and service**
- [x] **7. Readers and compact summary**

**Observations:**
- `profile.constants.ts` holds A32's values plus what the engine needed alongside them: `PROFILE_UPDATE_RETRY_POLICY` (A12, kept here rather than a separate profile-update constants file the spec doesn't list), `PROFILE_TRANSACTION_TIMEOUT_MS` (30 s, the runner's own completing-transaction timeout), `PROFILE_TAGS_LIMIT`, the competency order and labels, the source kinds with `weightOf` / `measurementSourceKindOf`, and both partial-update sentences verbatim from the spec.
- `profile-fold.ts`: `foldCompetency` sorts by `measured_at`, `created_at`, `id` and folds A4's formula, clamping to 0–100. Sub-scores fold at the row's weight and skip nulls; a row without a sub-score **carries the previous smoothed sub-score forward** into `accuracy_after` / `prosody_after` (null until one exists) — the spec leaves that column's meaning open for such rows, and carry-forward is what F20's chart can plot without gaps. `roundScore` (half up) and `scoreDelta` are exported for the route.
- **Gotcha:** `weight` round-trips through a `real` column as 0.3499999940…, so the refold snaps it back (`Math.round(w·1e6)/1e6`) before folding; otherwise a refold would drift from the fold that wrote the row. The refold rewrites only rows whose after-values moved by more than 1e-4, so an in-order arrival updates one row, not the whole log.
- `ledger-rules.ts`: the spec's `selectRecurring(entries, now, isRetired)` became `selectRecurring(entries, isRetired)` over entries that already carry `recentOccurrenceCount`; the window arithmetic lives in `windowCounts(occurredAt[], now)` (recent = within 30 days inclusive, previous = the 30 before), which `tagTrend` and the reader share, so the arrow and the count can't disagree.
- `profile-summary.ts`: `renderCompactSummary(competencies, weaknesses, examples, budget?)` — the snapshot argument is its competency list, and `budget` is a parameter so the drop order is testable. Maximal input (120-char labels, 500-char quotes, 77 tags) renders under the budget with nothing dropped. Example lines are only for tags in the included weakness list, so an example can never smuggle in history beyond the caps.
- `profile-ingestion.contract.ts`: `activityOutcomeSchema` accepts `occurredAt` as a `Date` or an ISO string (in-process callers will pass dates; the spec's example is JSON). `profileSourceInputSchema` also enforces the origin coherence the table's CHECK enforces, and that correct encounters come only from activities. `activitySource` maps an outcome to a source; the caller never supplies a weight.
- `ProfileIngestionService`: lock = `INSERT … ON CONFLICT DO NOTHING` + `SELECT … FOR UPDATE` on `learning_profiles`, then the spec's steps. Found while writing it: a replaced source's **encounter** tags must be re-aggregated too, not only its occurrence tags — an encounter that goes away can take a record from `practicing` back to `new`. Rejected tags are logged with user, kind, key and the activity type, never a quote (asserted). `rebuild` refolds the union of logged and materialized competencies and re-aggregates the union of logged and recorded tags, so hand-deleted evidence leaves nothing stale.
- `LearningProfileReader.snapshotFor` also returns `empty`, which the view needs; `updatedAt` is null unless at least one source exists (the lock row alone doesn't count). `measurementHistory`'s `limit` keeps the most recent points, still returned oldest first. The partial-update note follows A10 exactly: the most recent lesson source is pronunciation-only and that lesson's `lesson_analysis` stage row is `blocked_missing_key` or `failed`.
- `ErrorLedgerReader` gained `latestExamples(userId, tags)` for the summary service (one quote or word list per tag, in rank order) and a public `isRetired`. `dueEntries` is a real query (`due_at <= now`, not mastered, not retired), empty in Core because nothing sets `due_at`.
- `ProfileModule` provides and exports the engine, both readers, the summary service and the (still neutral) tags port; it imports `TaxonomyModule` only.
- Fixtures: `helpers/pipeline-fixtures.ts` gained `seedUser`, `seedLesson`, `lessonSourceInput`, `seedProfileSource` and `makeProfiledLesson` now rather than in step 12, since the engine suite needs them. The engine suite uses the plain `createTestContext()` (no MinIO): the test app never calls `ensureBucket`, so it touches nothing outside its own containers.

**Validation:** typecheck ✅ · lint ✅ · API unit 287/287 ✅ (29 new: fold 10, ledger rules 8, summary 6, contract 5) · `profile-ingestion.spec.ts` 15/15 ✅ (Testcontainers)
**Commit:** `72ff79d` F12 stage 2 - profile engine

## Stage 3: Lesson ingestion and seams — ✅ done

- [x] **8. Lesson source mapping**
- [x] **9. Profile update stage and pipeline order**
- [x] **10. Reconciliation job**
- [x] **11. Profile seams**
- [x] **12. Adapting earlier suites** — F11's `completion_advances_to_profile_update` now waits for `profile_update` completed and the branch at `plan_generation`; the drain's no-handler test moved to `plan_generation`; F09's focus fake is structural; `FAST_PROFILE_UPDATE_RETRY_POLICY` in the fixtures; the backoff unit test pins 5 s / 30 s; `pipeline-routes.spec.ts`'s `retry_reruns_downstream_stages` race fixed (below).

**Observations (2026-09-26, interrupted run):**
- The run was interrupted by a usage limit after this stage's code was written and resumed the same day; the full integration suite then ran to completion before the commit.
- **Pre-existing flaky test fixed:** `pipeline-routes.spec.ts > retry_reruns_downstream_stages` failed 3/3 in this worktree with 409 instead of 202. Running it on the pre-F12 main checkout (read-only, Testcontainers) showed it also fails there intermittently (1 of 3): it waited for `pronunciation_assessment` to complete, then failed transcription by hand, but F11's `lesson_analysis` job still ran afterwards (blocking at once, Ana holds no Gemini key) and moved the pointer off the hand-made failure. The test now also waits for `lesson_analysis` to reach `blocked_missing_key`, which is what its own comment ("let every downstream stage's first run settle") intended. 3/3 green after the fix. Not an F12 regression, but recorded here because F12 is where it got fixed.
- F10's `StoredPronunciationResultSummary` gained `id` and F11's `StoredAnalysisError` gained `id` (additive): the result row and the analysis row are the sources' revisions, and the error id is `analysis_error_id`.
- `profile-update/`: `lesson-profile-sources.ts`, `profile-update-stage.handler.ts` (both sources applied inside `context.complete`; missing inputs throw → `internal_error` after retries), `profile-reconciliation.job.ts` (`run()` takes no `now`: the sweep is time-independent; anti-join on `revision = r.id::text`, oldest lesson first, 50 per tick), `profile-update.module.ts`; `plan_generation` appended to `PIPELINE_STAGE_ORDER`; `ProfileUpdateModule` in `AppModule`.
- Seams: `ProfileTagsPort` real (recurring, analysis families, top 10); `PronunciationFocusPort` moved to `profile/` (old file deleted, F09 imports repointed, `ExcerptSelectionModule` imports `ProfileModule`), source `ledger@1` even with no tags (the ledger was consulted); `ErrorLedgerPort` created (F19 not landed) counting occurrences with `occurred_at <= lesson start`.
- `apps/api/AGENTS.md`'s neutral-port example now points at `recording/study-plan-fallback.port.ts`.
- Suites that delete intervals for determinism: `profile-pipeline.spec.ts` (reconciliation) and `profile-seams.spec.ts` (reconciliation and drain), following `recording-finalization.spec.ts`.
- The fault test was strengthened beyond the spec: a persistent trigger fault → 3 attempts → `failed` / `internal_error` with no partial rows and no lock row → the owner's retry through `PipelineService.retry` completes at run 2.

**Validation:** typecheck ✅ · lint ✅ · API unit 292/292 ✅ · full API integration suite 343/344 on the first run, the one failure being the pre-existing race above; `pipeline-routes.spec.ts` 12/12 ✅ three times after the fix. New suites: `profile-pipeline.spec.ts` 13/13, `profile-seams.spec.ts` 6/6, `lesson-profile-sources.spec.ts` 4/4.
**Commit:** `444940d` F12 stage 3 - lesson ingestion and seams

## Stage 4: Routes and document — ✅ done

- [x] **13. Profile routes**
- [x] **14. OpenAPI document**

**Observations:**
- `ProfileService` maps the readers to the three views: `roundScore` for scores and sub-scores, `scoreDelta` for deltas, ISO dates, `serverTime`. `subScores` is present only for Pronunciation with a measured accuracy; `prosody` inside it stays null when never measured. `AppError.ledgerEntryNotFound()` → `PROF001`; an unknown id and another user's give byte-identical bodies (asserted).
- `ProfileController`: `GET /profile`, `GET /profile/ledger` (`tag` through `ledgerListQuerySchema`, 3–64 characters → `VAL001`), `GET /profile/ledger/:entryId` (UUID pipe → `VAL001`), tag `profile`, one `@ApiResponse` per status and code. It lives in `ProfileModule` (controllers + `ProfileService`, the latter not exported); Nest registers the controller once even though four modules import `ProfileModule`.
- `openapi/components.ts` registers `LearningProfileView`, `LedgerEntryListView`, `LedgerEntryDetailView`; `setup.ts` adds the `profile` tag. Regenerated through `pnpm build` + `node dist/openapi/generate.js` (the `tsx` script's silent crash is still there): 27 operations, the three new ones.
- `profile-routes.spec.ts` covers the spec's 11 cases plus `renders_the_partial_update_note` (a pronunciation-only lesson whose `lesson_analysis` stage row is blocked → the blocked sentence in `notes`). Privacy is asserted on all three response shapes by absence: the other user's tag, quote, entry id, lesson id and user id.
- Runtime: the routes are exercised through the real HTTP stack (Nest + supertest + Postgres on Testcontainers). The running-stack check is in stage 7.

**Validation:** typecheck ✅ · lint ✅ · `openapi.spec.ts` 4/4 ✅ · `profile-routes.spec.ts` 12/12 ✅
**Commit:** `1372597` F12 stage 4 - routes and document

## Stage 5: Web profile screen — ✅ done (browser check in stage 7)

- [x] **15. Navigation and design reference**
- [x] **16. Profile screen**
- [x] **17. Ledger detail dialog**

**Observations:**
- `AppHeader` destinations are Dashboard, Profile, Settings; the comment names where F19's Lessons goes (between Profile and Settings, the mobile tab order). `design/README.md`'s dashboard pill row now reads "Dashboard, Profile (F12) and Settings"; the settings table's row already points at the dashboard's, so only one row changed. The F22 dated note is stage 7's step 22.
- `lib/relative-time.ts` is new (F19 had not landed): A29's bands, formatted in the viewer's timezone against the view's `serverTime`. Minutes win over the calendar day just after midnight (23:50 → 00:10 reads "20 minutes ago"). The older `relativeTime` in `lib/credentials.ts` (settings cards) was left alone.
- **Primitive extended, not forked:** `EmptyState`'s one action can now be `{ label, href }`, rendered as a `next/link` styled like the neutral button, because the empty profile's only action is navigation (`Open classroom` → `/classroom`); `page-states.spec.tsx` gained `an_action_that_goes_somewhere_is_a_link`.
- **Deviation (wording):** the error states use the shared `ErrorState` primitive, whose button reads `Try again` on every page, not the spec's `Retry`.
- The screen composes `Card`, `Meter`, `Badge`, `Button`, `EmptyState`, `ErrorState`, `LoadingState` and `Skeleton` only. The loading skeleton is shaped like six meters and two rows. Warming-up competencies use `Meter` unchanged (A30); the Pronunciation disclosure is a small neutral `Button` with `aria-expanded` and `aria-controls`, revealing Accuracy and Prosody (or "Prosody: not measured for this language"). The partial-update note is an `info` card with `role="note"`.
- Weakness rows are one `<button>` each, with an `aria-label` reading the whole row (`Third conditional: 6 times, last seen 3 days ago, New, Rising`). The trend is arrow + word, coloured `error` for rising and `tertiary` for falling (an error rising is the bad direction), never by colour alone.
- `LedgerEntrySheet` is a modal `dialog` labelled by the tag's label. Focus moves to its close button on open; Escape or the close button closes it; the screen returns focus to the row that opened it (asserted). It has its own loading and error-with-retry states.
- **A27 applied: lesson sources render as plain text** (`Lesson · 3 days ago`), because F19's `/lessons/{id}` does not exist on this branch. The link is one constant, `LESSON_DETAIL_HREF` in `ledger-entry-sheet.tsx`, currently `null`; whichever of F12 and F19 lands second sets it. The spec's `lesson_examples_link_to_the_lesson` became `lesson_examples_render_as_text_until_f19_ships_lesson_detail`. Recorded as an F19 follow-up in stage 7.
- `/profile?tag=` resolves the tag through `GET /profile/ledger?tag=` and opens its dialog (`a_tag_in_the_address_opens_its_detail`), which is where F19's error-card chip will link. F19's `error-card.tsx` does not exist here, so wiring the chip is an F19 follow-up.
- `apps/web/AGENTS.md` lists the profile screen, `getProfileView`, `relative-time.ts` and `profile.ts`.

**Validation:** web typecheck ✅ · lint ✅ · web tests 146/146 ✅ (new: `profile-screen` 11, `ledger-entry-sheet` 5, `relative-time` 2, `app-shell` +1, `page-states` +1; the token-resolution, no-raw-values and design-reference guards pass) · browser check against a running F12 API: pending, done in stage 7 on an isolated stack
**Commit:** `b0f5de1` F12 stage 5 - web profile screen

## Stage 6: Mobile profile screen — ✅ done

- [x] **18. Mobile primitives**
- [x] **19. Profile models and controller**
- [x] **20. Profile page and detail sheet**

**Observations:**
- **No mockup on either client** (mobile-ui section 1, case 3): the screen composes `Eq*` widgets only, with the web's copy and states. Translation decisions from the web page: the detail dialog became a modal bottom sheet (max 85% of the height, scrollable); the empty state has **no action**, because the live lesson is web-only; the error button reads `Retry` (`EqError`'s own wording, while the web primitive says `Try again`); pull-to-refresh reloads the profile, as the shell's other tabs do; weakness rows stack name, `N times · last seen …`, then badge and trend on a wrap line instead of the web's two-column row; content is capped at 560 dp and centred for tablets.
- `EqMeter` (new) mirrors the web `Meter`: value, signed delta (zero renders nothing), `warmingUp` state with a hatched track drawn like `meter-track-warming`, and one semantics node (`Grammar: 68 out of 100, up 3` / `Interaction: warming up, not enough data yet`). It also takes `showNullDelta` for F19's `—` (A29); the profile doesn't use it. `EqChip` (new) mirrors the web's five tones and `count`; the profile screen doesn't use it yet (F19's error-card chip will).
- **Primitive extended:** `EqEmpty`'s action is now optional (both label and callback, or neither), with a widget test.
- **Accessibility gotcha found by the tests:** a plain `Semantics(label:)` inside a card merges into the card's node, so the meter and the row need `container: true`; and `excludeSemantics` on the row dropped the `InkWell`'s tap action, so the row's `Semantics` carries `onTap` itself.
- `core/format/relative_time.dart` (new) uses the web's bands; both suites pin the same 12-row case table built from local date parts, so they hold in any timezone.
- `profile_models.dart` mirrors the three views (enums for competency, trends, state and source kind; `LedgerState.newTag` because `new` is reserved in Dart) and ignores unknown fields (asserted with a Full-scope-style `recentImprovements` key). `ProfileController` loads the view and a record's detail, plus `findEntryByTag` for F19's chip; `ledger_entry_sheet.dart` exports `showLedgerEntrySheetForTag(context, controller, tag)` for F19 to call.
- Lesson sources render as plain text (`Lesson · 3 days ago`): F19's `/app/lessons/{id}` does not exist on this branch (A27). `features/lessons/widgets/error_card.dart` does not exist either, so wiring the chip is an F19 follow-up.
- `ProfilePage` takes an optional `controller` for tests and builds one over `inject<Dio>()` otherwise, as `SettingsPage` does. `app_module.dart` and `app_config.dart` untouched.
- `test/helpers/pump_screen.dart` is the mobile-ui skill's small-phone snippet, added the first time a screen needed it. The skill's widget list now includes `EqMeter`, `EqChip` and the relative-time formatter.

**Validation:** `flutter analyze` 0 issues ✅ · `flutter test` 54/54 ✅ (new: `eq_meter` 3, `eq_chip` 1, `relative_time` 2, `profile_models` 3, `profile_page` 6, `page_state` +1; the page is pumped at 360×690 dp and at 1.3× text with no overflow) · `flutter build apk --debug` ✅ · on-device review: left to the user, per `apps/mobile/AGENTS.md`
**Commit:** `72930f0` F12 stage 6 - mobile profile screen

## Stage 7: Verification and hand-off — ✅ done

- [x] **21. Live verification**
- [x] **22. Follow-ups for neighbouring features**

**Observations:**
- **Isolated stack, not the shared one.** F19 was being implemented at the same time against the shared `english-quest` stack (which bind-mounts the main checkout). The live checks ran on a separate compose project, `english-quest-f12`, started from this worktree with its own volumes and ports (API 3101, web 3100, Postgres 5442, Redis 6389, MinIO 9110/9111; no LiveKit or egress), and a worktree `.env` copied from the main one with `WEB_ORIGIN` / `NEXT_PUBLIC_API_URL` on `127.0.0.1`. The host is `127.0.0.1`, not `localhost`, because cookies ignore ports: logging in on `localhost:3100` would have replaced the shared stack's session cookie in the same browser. The shared database was only read: users and credentials were copied from it with `pg_dump --data-only`, so the seeded user's already-stored keys (encrypted under the same master key) ran every provider call. The isolated user's password hash was replaced by a throwaway one generated for the run, so no real password was used. The stack, its volumes, its images, the worktree `.env` and every throwaway script were removed afterwards; the shared containers were never restarted.
- **Taxonomy symbols, a real finding:** the stage-1 probe had confirmed the spec's 41 symbols, but the end-to-end lesson returned `phoneme:/ɛɹ/` ("there"), which the stage rejected and logged exactly as A17 intends (`rejected_tags` on the source, one warning line with no quote). A targeted Azure probe (r-coloured vowels, "few", "cute") showed Azure's en-US alignment returns eight **compound units**: `ɛɹ` (air), `ɪɹ` (ear), `ʊɹ` (sure), `ɑɹ` (car), `ɔɹ` (four, also "tour"/"poor"), `aɪɹ` (fire), `aʊɹ` (hour) and `ju` (few). Following the checklist's "fix the file", they were added to **v2** before it ever left this branch: 49 phoneme tags, 85 in total, fingerprint re-pinned at `309b079c07…`, and a dated note appended to the spec's A13 table. **Deviation from stage 1's record**, which said 41 / 77; stage 1's note is left as written and corrected here.
- **Backfill:** the shared dev database had no pronunciation results and no analyses (stage 1), so there was nothing to backfill: 0 before, 0 after. The job's backfill path was exercised instead by deleting scratch lesson A's pronunciation source after the taxonomy fix: the job re-applied it within one 15 s tick, now with 19 occurrences, `phoneme:/ɛɹ/` included, and nothing rejected.
- **End to end (lesson A):** a 47 s offline Windows TTS clip with deliberate errors, uploaded as a launched recording and left to the dev server's own drain. Real transcription, selection and Azure assessment, a real Gemini analysis, then `profile_update` completed and the branch rested at `plan_generation` / `queued`. `GET /profile`: six competencies from their own sources (Pronunciation 86 with accuracy 92 and prosody 73 from F10; Grammar 35 … Comprehension 65 from F11), all `Warming up`. The ledger held 4 grammar tags with real quotes and corrections (`Subject-verb agreement` ×3: "My brother don't like", "The people there was very friendly", "the prices was much too high") and 18 phoneme tags. `GET /profile/ledger/:entryId` returned the three examples with corrections and one lesson source.
- **Blocked analysis (lesson B):** with the user's Gemini credential flipped to `invalid` in the isolated database, F08–F10 completed, `lesson_analysis` blocked as `credential_rejected`, and the reconciliation job applied the pronunciation source within the same second. `GET /profile` carried "Only Pronunciation was updated from your latest lesson. Add your Gemini key to update the other five competencies.", Pronunciation had 2 measurements and the other five were untouched at 1. Restoring the key let the drain resume the analysis on its own (run 2); `profile_update` then logged `lesson_pronunciation skipped; lesson_analysis ingested` (idempotency, live), the note disappeared, and all six competencies had 2 measurements.
- **Role card:** with two real recurring weaknesses (`grammar:subject-verb-agreement` ×5, `grammar:preposition` ×3), a card was generated with the real Gemini key through `RoleCardService.ensureCard`, called from a compiled script (the isolated stack has no LiveKit, so the token route could not start the scenario). `ProfileTagsPort` returned exactly those two, and the card request's `weakness_tags` was `grammar:subject-verb-agreement, grammar:preposition`. The model's expressions include fixed prepositional collocations ("in accordance with regulations", "catering to passenger safety"), which reads as targeting `grammar:preposition`; none clearly targets subject-verb agreement.
- **Web, in the browser pane:** `/profile` for the real profile in light and dark, via the app's own theme toggle. The partial-update note card, six `Warming up` meters, and by keyboard the Pronunciation disclosure (`aria-expanded` true, Accuracy and Prosody sub-meters). Then the row, whose accessible name was "Subject-verb agreement: 3 times, last seen 38 minutes ago, New, Rising", and Enter opened the dialog with focus on Close, showing the three real quotes. Escape closed it and focus returned to the row. The empty state, as the second account: "No profile yet." with an `Open classroom` link to `/classroom`. No console errors. A narrow (540 px) pane rendered without overflow.
- **Mobile:** `flutter analyze` 0 issues, `flutter test` 54/54, `flutter build apk --debug` built (stage 6). The on-device review is the user's.
- **Clean-up and rebuild:** deleting the three scratch lessons cascaded every source, measurement and occurrence, but left 6 competency rows and 24 ledger records materialized, which is exactly the case `rebuild` exists for. `rebuild(userId)` then left 0 and 0, and the snapshot read `empty` with a null `updatedAt`.
- **Step 22:** dated notes were appended to F06 (the tags port is real, and its criterion is testable), F09 (the focus port moved and is ledger-backed; the fake is structural; the retry race fixed), F11 (the stage it hands to now runs, the adapted suites, taxonomy v2) and F22 (the Profile pill supersedes "exactly Dashboard and Settings").
- **F19 follow-ups are recorded here, not in F19's spec.** That spec is being written in the concurrent F19 worktree and does not exist on this branch, so editing it here would only create a merge conflict. Whichever of F12 and F19 lands second must:
  1. set `LESSON_DETAIL_HREF` in `apps/web/src/components/profile/ledger-entry-sheet.tsx` to return `/lessons/{id}`, and link the mobile sheet's lesson sources to `/app/lessons/{id}`;
  2. make the web error-card tag chip a link to `/profile?tag={tag}`, and on mobile call `showLedgerEntrySheetForTag(context, controller, tag)` from `ledger_entry_sheet.dart`;
  3. add the `plan_generation` stage label (`Plan generated`, staying `Queued` until F15) wherever F19 defines `pipelineStageLabels`, on both clients;
  4. reconcile `EqMeter`, `EqChip`, `core/format/relative_time.dart` and `lib/relative-time.ts`: F12 created all four (A29). If F19 created its own, keep one of each, and keep the shared case table;
  5. put the header pill in the order Dashboard, Profile, Lessons, Settings;
  6. read the recurrence badge through `ErrorLedgerPort.occurrencesThrough` (`apps/api/src/profile/error-ledger.port.ts`), which F12 created because F19 had not landed. If F19 also created a port with a neutral default, F12's implementation replaces it.
- **Spec notes for F14–F20, re-read against the build:** they match. `unmasteredTags`, `dueEntries` (empty in Core) and `compactSummaryFor` exist as described (F14, F15). `plan_generation` is where every profiled branch waits (F15). `ingestActivityOutcome(outcome, tx?)` takes the described shape, and `occurredAt` accepts a `Date` or an ISO string (F16–F18). `measurementHistory` returns `scoreAfter` and `sourceKind` per point, and `limit` keeps the most recent (F20). The one addition is that F18's `phoneme:` occurrences can now use the eight compound units.

**Validation:** every live check above passed. The one real finding, the taxonomy gap, was fixed and re-verified live. `error-taxonomy.spec.ts` + `profile-summary.spec.ts` 19/19 ✅ after the fix · lint ✅
**Commit:** `1bec419` F12 stage 7 - live verification and hand-off

## Final verification

**Status: success.** Every Core acceptance criterion's tests pass in a fresh run, every Component Overview file exists with its contract, the full suite is green, and every runtime surface was exercised live. The three Full-scope criteria are deferred by the spec's Core-only decision (A1), not failed.

**Full suite (6.1), fresh, on the final commit:**
- lint ✅ (zero warnings) · typecheck ✅ (shared, design-tokens, api, web)
- API unit 292/292 ✅ · API integration 356/356 ✅ (30 files, Testcontainers)
- web 146/146 ✅ · design-tokens 17/17 ✅ (see below) · mobile `flutter analyze` 0 issues, `flutter test` 55/55 ✅

**Component Overview (6.2):** all 52 listed files exist with the described role; `excerpts/pronunciation-focus.port.ts` is gone; `plan_generation` is in the shared enum and the pipeline order; `ProfileUpdateModule` is in `AppModule`; `PROF001` is defined; the three routes are in `docs/api/openapi.json`. The two F19-conditional rows (`components/lessons/error-card.tsx`, `features/lessons/widgets/error_card.dart`) do not apply because F19 had not landed; their wiring is F19 follow-up 2 in stage 7. **Missing from spec:** none.

**Acceptance criteria (6.3):**
- ✓ Six competency scores, pronunciation from Azure and five from the LLM: `six_competencies_come_from_their_own_sources`, `lesson_scores_update_the_six_competencies_from_their_own_sources`, `returns_six_competencies_in_order_with_rounding_and_deltas`, and live (lesson A).
- ✓ A lesson moves a score at 0.35, never overwriting it: `a_lesson_measurement_moves_the_score_at_0_35`, `a_lesson_moves_scores_at_0_35_and_an_activity_at_0_15`.
- ✓ An activity moves a score at 0.15: `an_activity_measurement_moves_the_score_at_0_15`, `a_lesson_moves_scores_at_0_35_and_an_activity_at_0_15`.
- ✓ Under 3 measurements, `Warming up` and no trend: `fewer_than_three_measurements_have_no_trend`, `warming_up_competencies_carry_no_trend`, `warming_up_competencies_show_the_marker` (web), `warming_up_hides_the_value_and_announces_it` (mobile), and live.
- ✓ One record per tag per user, with counts, first and last seen, sources and up to 5 examples: `each_tag_has_one_record_with_counts_seen_sources_and_examples`, `the_detail_returns_up_to_five_examples_and_every_source`.
- — `mastered` after 3 correct encounters on 2 distinct days: deferred (Full scope). Core keeps the evidence and never masters early (`correct_encounters_are_recorded_and_move_a_tag_to_practicing`, `core_never_writes_mastered_or_a_due_date`).
- — A new occurrence returns a mastered tag to `practicing`: deferred (Full scope); no tag is mastered in Core.
- — Due dates at 1, 3, 7, 16 and 35 days: deferred (Full scope); `dueAt` is always null in Core (`core_never_writes_mastered_or_a_due_date`).
- ✓ Recurring weaknesses are exactly the unmastered tags with at least 3 occurrences in 30 days: `recurring_needs_three_occurrences_in_thirty_days`, `recurring_excludes_mastered_and_retired_tags`, `recurring_weaknesses_list_exactly_the_qualifying_tags`.
- ✓ The compact summary never exceeds 1,500 tokens: `never_exceeds_1500_estimated_tokens` (with 85 maximal tags).
- ✓ Re-running a lesson's profile update changes no occurrence count: `rerunning_the_profile_update_does_not_change_any_occurrence_count`, `reapplying_the_same_revision_changes_nothing`, and live (`lesson_pronunciation skipped`).
- ✓ Unknown tags are rejected and logged while known ones are ingested: `unknown_tags_are_rejected_and_logged_while_known_ones_are_ingested`, and live (`phoneme:/ɛɹ/` before the taxonomy fix).

**Cross-feature (F12's halves):**
- ✓ F10/F11 → F12 weights: `lesson_scores_update_the_six_competencies_from_their_own_sources`.
- ✓ F11 → F12 ledger with quotes, counts across lessons: `analysis_errors_reach_the_ledger_with_their_quotes`, `counts_increment_across_consecutive_lessons_carrying_the_same_tag`.
- ✓ F12 → F14 readers: `recurring_weaknesses_list_exactly_the_qualifying_tags`, `a_retired_tag_keeps_its_record_as_history`.
- ✓ F12 → F15 summary and due list: `never_exceeds_1500_estimated_tokens`, `core_never_writes_mastered_or_a_due_date`.
- ✓ F16–F18 → F12 within 5 seconds: `activity_outcomes_update_scores_and_ledger_synchronously`, `an_activity_joins_the_callers_transaction`, `a_duplicate_activity_submission_writes_nothing_twice`.
- ✓ F10 → F18 shared ledger: `phoneme_tags_from_f10_reach_the_ledger`, `activity_phoneme_tags_join_the_lesson_ledger_record`.
- ✓ F12/F15 → F20 one reader: `the_profile_view_and_the_reader_agree`.
- ✓ F02 credentials only: `profile_update_calls_no_provider`.
- ✓ F06 card targets a weakness tag, F12's half: `the_role_card_request_carries_the_owners_weakness_tags`, plus the live card, whose expressions target `grammar:preposition`.

**Smoke checks (6.4):** all exercised live on the isolated stack (stage 7): the pipeline stage end to end, the reconciliation job (blocked analysis and re-apply), the three routes, the web page (light, dark, empty, ready, disclosure, dialog by keyboard), and `rebuild`. Mobile: analyze, tests and a debug APK build. The on-device review is the user's, per `apps/mobile/AGENTS.md`.

**Regressions:** none.

**Deviations** (details in each stage's observations): FK names left to the codebase's inline convention (stage 1). Taxonomy v2 has 49 phoneme tags, not 41: Azure's compound r-coloured units and `/ju/`, found live (stage 7). `selectRecurring` takes precomputed window counts, and `renderCompactSummary` takes a `budget` (stage 2). The reconciliation job's `run()` takes no `now` (stage 3). `focus_source` is `ledger@1` even with no phoneme tags (stage 3). `EmptyState` / `EqEmpty` were extended rather than forked (stages 5 and 6). The web error button says `Try again` (the shared primitive) and the mobile one `Retry` (stage 5). Lesson sources are plain text until F19 ships lesson detail (A27). `ErrorLedgerPort` was created by F12 (F19 not landed). The F19 follow-ups live in this log, not in F19's spec.

**Soft-fails:** none blocking. On-device mobile review is left to the user by project rule.

**Pre-existing failures:**
- `pipeline-routes.spec.ts > retry_reruns_downstream_stages`: a race that also fails intermittently on the pre-F12 main (1 of 3). Fixed in stage 3 by waiting for `lesson_analysis` to settle.
- `packages/design-tokens` `generated_files_match_a_fresh_generation` fails in any `core.autocrlf=true` checkout whose generated files were checked out with CRLF (this worktree, after stage 1's `git checkout --` restore); the index holds LF and there is no content difference. `pnpm tokens:build` restores LF, and it then passes 17/17. It was not a code change and was not committed.

**Open follow-ups:**
- The six F19 wiring items listed in stage 7, for whichever of F12 and F19 merges second.
- Full scope: the mastery lifecycle (streaks, distinct days, `mastered`, the 1/3/7/16/35 schedule and `due_at`) from the recorded `error_ledger_encounters`, and recent improvements on the snapshot, summary and both screens.
- Rejected tags are queryable in `profile_sources.rejected_tags`, but a later taxonomy that adds a tag does not re-ingest it from sources already applied. A curator tool (or a new revision of the source) would be needed; the live run did it by deleting the source so the job re-applied it.
- The `tsx`-based `openapi:generate` script still exits 1 silently (the `emitDecoratorMetadata` gap first recorded by F10); the snapshot was generated through `pnpm build` + `node dist/openapi/generate.js`.
- Merge note: this branch was fast-forwarded to `f90378a`; `main` has since gained `e8932bd` (F13 spec and plan, docs only).

## Merge with main (2026-09-27)

- `origin/main` gained F13 (content bank) after this run's base. Merged into this branch before the PR. F13 had already numbered its migration `0013_content_bank`, leaving `0012` to F12, so migrations apply in order with no renumbering.
- Six textual conflicts, all additive (both features appended at the same spot): `schema.prisma` (User back-relations and the models at the end), `app.module.ts`, `app-error.ts`, `codes.ts`, the shared `index.ts` barrel, and `openapi.json`. Both sides were kept; `openapi.json` was regenerated (30 operations with F13's, `PROF001` and F13's `CONTENT001`/`CONTENT002`).
- Two semantic follow-ons of F12's taxonomy v2 inside F13's code, fixed here: `test/integration/helpers/content-fixtures.ts` builds a `LoadedErrorTaxonomy` by hand, so it now supplies `familyOf` and a family `format` (`ipa` for a `phoneme:/…/` tag); and `assignment-content/*/meta.schema.json`, whose `target_tags` enum mirrors the taxonomy in force, was regenerated with F13's own `pnpm content:schema` (85 tags).- F13's `save_generated_rejects_invalid_input_with_val001` pinned the taxonomy version (`v1`) in an expected message; it now reads the version in force. After the merge: typecheck ✅ · lint ✅ · API unit 339/339 ✅ · API integration 395/395 ✅ (394 in the merged run, plus the fixed F13 test re-run 16/16) · web 146/146 ✅ · tokens 17/17 ✅.

