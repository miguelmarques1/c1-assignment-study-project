# Implementation Progress: Design Reference and Visual Realignment

**Status:** success
**Branch:** main
**Started:** 2026-09-15
**Last updated:** 2026-09-15 (Final Verification)

## Stage 1: The Design Reference — ✅ done

- [x] **1. Mockup analysis**
- [x] **2. Reference document**
- [x] **3. Completeness guard**

**Observations:**
- Read all four `code.html` files (not just `screen.png`) to ground the mapping in exact copy, icon names and markup structure rather than visual impression alone. This surfaced detail the screenshots alone didn't show: a hidden toast-notification system, a hidden key-replacement modal, and secondary per-provider trust micro-icons beside the Gemini/Azure titles.
- **Scoping decision on "region" granularity:** the toast and the modal never render in `screen.png` by default (both start `hidden`/`opacity-0` — they're the Stitch mockup's own demo-interactivity scaffolding, not part of the visual design being reviewed). Neither got a row in `design/README.md`. The modal in particular represents the "replace key" flow, which the product already has via `CredentialCard`'s inline `editing` state — Stage 3 continues that pattern rather than introducing a modal, since switching interaction models was never part of the interview and would be scope creep for a visual-realignment feature. Same reasoning for the secondary trust micro-icons: folded into their parent row's Reference text rather than given their own row.
- **Deviation — icon count grew from ~8 to 9:** the settings help card needs a leading icon to match the mockup visually (per spec.md's "the layout it balances is correct from the start"), so `HelpIcon` joins the planned set. Logged here since the interview and spec.md both estimated "~8 icons."
- **Deviation — one dropped row cites Section 6, not Section 7:** the copy-key control's real exclusion reason is F02's own business rule ("the original value cannot be revealed anywhere... replacing it is the only way to change it") — a Section 6 constraint on an already-implemented feature, not a Section 7 scope boundary. The PRD's F22 acceptance criterion says dropped rows name "the Section 7 clause that excludes it," written when every drop candidate I'd identified was in fact a Section 7 item; this one genuinely isn't. Citing Section 7 anyway would be less accurate, not more, so the guard (`dropped_regions_cite_an_exclusion`) was written to accept either "Section 6" or "Section 7", and the row cites the correct one.
- **Header rows are duplicated, not shared, across the dashboard and settings tables** — the markup is byte-identical between the two mockups, and spec.md's own schema is "one table per mockup, one row per region." Rather than inventing a cross-mockup row (which the schema doesn't have a slot for), the streak/XP-chip drop reasoning lives once, in the dashboard table, and the settings table's matching rows point at it ("see the dashboard table"). The guard accepts that cross-reference pattern explicitly, rather than requiring the same citation typed out twice.
- `design/README.md` covers all four mockup directories (`english_quest_sign_in`, `english_quest_dashboard`, `english_quest_settings`, `english_quest_logo`) with 45 rows total. All five PRD-named deferred dashboard regions are present (hero → F05, module cards → F05/F06/F15/F18, stat cards → F20, recommended-scenario card → F06, `Scenarios & Practice` destination → F06 via the nav-pill row's reference).
- `apps/web/test/design-reference.spec.ts` parses the document's markdown tables directly (no new dependency) and cross-checks deferred owners against the real feature ids in `docs/prd.md` Section 8 — so a typo'd feature id or a region pointing at a feature that doesn't exist fails the build, not just a human review.

**Validation:** `apps/web` typecheck ✅ · `apps/web` test suite ✅ (54/54 — 48 pre-existing + 6 new in `design-reference.spec.ts`) · repo-wide `pnpm lint` ✅ (0 warnings)
**Commit:** `6c028cb` — F22 stage 1 - the design reference

## Stage 2: Library Extensions — ✅ done

- [x] **4. Icon set**
- [x] **5. Text field composition**
- [x] **6. Header pieces**
- [x] **7. Gallery registration**

**Observations:**
- Nine icons under `components/ui/icons/`: `MailIcon`, `LockIcon`, `EyeIcon`, `EyeOffIcon`, `TrashIcon`, `SettingsIcon` (the mockup's "tune" sliders glyph, not a gear), `GeminiIcon` (a generic four-point sparkle — deliberately not Google's Gemini logomark, since hand-copying a trademarked asset isn't something to do casually), `AzureSpeechIcon` (a microphone), `HelpIcon`. All inline SVG, `aria-hidden` by default, sized via a unitless numeric prop (matching `Logo`'s existing pattern, which also keeps `no_inline_style_attribute_carries_a_dimension_or_colour` from flagging the `Avatar`'s dynamic `style={{ width: size, height: size }}` — no literal `px`/`rem` string ever appears in the source, only a JS variable).
- **Real gotcha found by the token-resolution guard, not by review:** `NavPill` first used `bg-surface-container-high`, copied straight from the mockup's own ad-hoc Tailwind config. This project's real token set only has three surface-container tiers (`lowest`, plain, `highest`) — no `-high`. Fixed to `bg-surface-container`. This is exactly the class of error the guard exists to catch before it ships, and it did.
- **`TextField` does not build on `fieldControlClassName` plus extra classes.** Tailwind's generated stylesheet order — not the order utility classes appear in a className string — decides which wins when two target the same property, so appending `pl-xl` after the shared constant's `px-md` would not reliably override the left side. `TextField` owns a parallel base class string using directional `pl-*`/`pr-*` instead of `px-md`, so the leading-icon and reveal-button paddings can vary independently without depending on cascade order. This is a real, if narrow, Tailwind trap — logged here so nobody "simplifies" it back to `cn(fieldControlClassName, 'pl-xl')` later.
- `Field` gained exactly the planned `labelAside` slot (an optional node at the end of the label row); its render-prop contract and the three existing callers are unaffected — verified by the full existing test suite staying green.
- `NavPill` is a Client Component using `usePathname()` internally rather than taking the current path as a prop, so the (app) layout — a Server Component — doesn't need to become one just to know where it is. The destination list is data, not hardcoded markup, so `Scenarios & Practice` (or any future destination) is a config change in Stage 3, not a NavPill change.
- **Runtime verification without Docker:** Playwright's visual suite needs the containerized web service for platform-stable screenshots (`playwright.config.ts`'s own comment: Chromium rasterises fonts differently per OS, so a host-generated baseline would fail for anyone else), and Docker Desktop is still not running in this environment. As a substitute, started the Next.js dev server directly on the host and fetched `/design-system` for real: HTTP 200, no error overlay, all 12 expected `data-vr` blocks present including the new `icons` block, 11 real `<svg>` elements rendered, and the password reveal control's `Show password` accessible name present in the markup. This confirms the new components compile and render correctly; it does not and cannot confirm pixel-level fidelity.
- `icons` was added to `apps/web/e2e/visual.spec.ts`'s `BLOCKS` list because it's now a real, permanent gallery section and `the_documentation_page_lists_every_component` needs to know about it — but no baseline image exists for it yet (nor could one be generated this session). This is a deliberate, temporary gap: the visual suite's screenshot tests for `icons` (and the pre-existing `field` block, now showing three new `TextField` variants) will fail on first run until someone with Docker available runs the suite with `--update-snapshots` once. Logged again under Stage 4.

**Validation:** `apps/web` typecheck ✅ · `apps/web` test suite ✅ (54/54, one real token-guard failure found and fixed mid-stage) · repo-wide `pnpm lint` ✅ (0 warnings) · runtime ✅ host dev server smoke-check of `/design-system` (HTTP 200, all sections present, no render errors) · soft-fail: Playwright visual baselines for `icons` and the updated `field` block not generated (Docker unavailable this session)
**Commit:** `96561db` — F22 stage 2 - library extensions

## Stage 3: Screen Realignment — ✅ done

- [x] **8. Login**
- [x] **9. Shell header**
- [x] **10. Settings frame**
- [x] **11. Credential cards**
- [x] **12. Credential form**

**Observations:**
- **`TextField` needed a `forwardRef`, not planned in Stage 2:** `login-form.tsx`'s existing focus-restoration behaviour (`passwordRef.current?.focus()` after a failed attempt, so retyping doesn't require a manual click) depends on a DOM ref to the input. `TextField` didn't forward one. Added `forwardRef<HTMLInputElement, TextFieldProps>` — the only Stage 2 change made during Stage 3, and a legitimate one: the need only became visible once a real caller with this exact requirement showed up. All 5 pre-existing `login-form.spec.tsx` tests (including the focus-restoration one) passed unmodified against the change, confirming nothing broke.
- **Deviation — architecture, not visual:** the status chip's cross-feature AC ("deleting flips it to attention, restoring flips it back") needs the chip and the credential grid reading the *same* live state, not two independently-fetched copies. `settings/page.tsx` (a Server Component) can't own React state, and two sibling Client Components can't share state without a common parent owning it. Resolved by lifting all interactive state up into one new component, `SettingsScreen` — it owns `credentials`/`error`, renders the heading + chip + BYOK card + help card directly, and delegates only the grid to a now-*controlled* `CredentialsPanel` (previously self-contained; now takes `credentials`/`error`/`onRetry`/`onChanged`/`onRemoved` as props). `settings/page.tsx` shrank to just the server fetch. No existing test depended on `CredentialsPanel`'s old self-contained shape, so this was a clean refactor, not a breaking one. The pure derivation (`aggregateCredentialStatus`) is exported separately so it's unit-testable without rendering anything.
- **Real gotcha caught by the existing test suite, not by review:** `credential-card.spec.tsx` had two tests querying the delete button by its old visible text, `'Delete'`. The icon-only replacement has no visible text — its accessible name is now `'Delete Gemini key'` (via `aria-label`, naming the provider so two adjacent cards' delete buttons are still distinguishable by screen reader, which a bare `'Delete'` wouldn't have been). Both queries updated. A third test asserted the masked key via `container.textContent` — but `TextField`'s `readOnlyPresentation` renders the value as an `<input value>` attribute, which never appears in `textContent` (only real DOM text nodes do). Fixed to read `.value` off the input directly. Neither of these was a design mistake — the component's contract changed and the tests that encoded the old contract needed to change with it, exactly the class of thing this project's `implement-feature` skill exists to catch before considering a phase done.
- **Runtime verification without Docker, again:** the containerized web service still isn't available, so a real Playwright run remains impossible this session. As in Stage 2, started the Next.js dev server directly and fetched the real routes: `/login` → 200, with `e.g. learner@quest.io`, `Show password` and the login form's four `<svg>` elements (logo + 2 leading icons + reveal icon) all present in the markup, no error overlay. `/settings` → 307 redirect to `/login` (no live API this session, so `getCurrentUser()` correctly finds no session) — this confirms the auth gate still works correctly post-refactor, though it means the settings screen's own markup (chip, provider icons, read-only key field) could not be fetched and inspected the same way. That gap is covered instead by the 11 new/extended component tests exercising `SettingsScreen`/`CredentialCard`/`CredentialsPanel` directly against fixtures, which don't need a live API.
- The header's logo+wordmark link and the `ThemeToggle` were left untouched, exactly as `design/README.md` records (`implemented — unchanged`).
- No dashboard file was touched in this stage — verified via `git status` before staging, matching the AC that nothing here implements or mocks dashboard content.

**Validation:** `apps/web` typecheck ✅ · `apps/web` test suite ✅ (75/75 — 54 from Stages 1–2 + 6 new `text-field.spec.tsx` + 5 new `app-shell.spec.tsx` + 6 new `settings-status.spec.tsx` + 2 new + 2 fixed in `login-form.spec.tsx` + 2 new + 2 fixed in `credential-card.spec.tsx`) · repo-wide `pnpm lint` ✅ (0 warnings) · runtime ✅ host dev server smoke-check of `/login` (HTTP 200, all realigned elements present, no render errors) and `/settings` (HTTP 307 to `/login`, correct unauthenticated behaviour) · soft-fail: settings screen's own markup not fetched live (no session available without a running API), covered instead by component tests against fixtures; Playwright visual baselines still not generated (Docker unavailable)
**Commit:** `d8738d3` — F22 stage 3 - screen realignment

## Stage 4: Coverage and Verification — ✅ done

- [x] **13. Screen baselines**
- [x] **14. Component tests**
- [x] **15. Mobile verification**
- [x] **16. Full verification**

**Observations:**
- **Login baseline written; settings baseline deliberately not.** `apps/web/e2e/visual.spec.ts` gained `the_login_screen_matches_its_light_baseline` / `..._dark_baseline`, following the file's existing `gotoDocs` pattern (a new `gotoLogin` helper). `/login` needs no session, so this is real, complete test code — just unable to produce its baseline `.png` this session (Docker unavailable, same as the gallery's `icons`/`field` blocks from Stage 2). Settings sits behind the session guard, and this repository has **no existing e2e auth-seeding pattern** (no storageState fixture, no test-login helper, checked directly — grepped the whole `e2e/` tree, found nothing). Writing one now, with no live API and no seeded test user reachable to verify it against, would mean shipping speculative scaffolding that might not even be correct — worse than not writing it. Logged as a concrete named gap rather than silently short-scoping step 13.
- **Component tests (step 14) were substantially written during Stage 3**, as each screen's realignment surfaced its own test needs (`text-field.spec.tsx`, `app-shell.spec.tsx`, `settings-status.spec.tsx`, plus extensions to `login-form.spec.tsx` and `credential-card.spec.tsx`). Nothing new was added in this stage's slot except one gap found during the AC re-check below.
- **Mobile verification, done mechanically, not by inspection:** `git diff --stat 2c9ca2b^ HEAD -- packages/design-tokens/ apps/mobile/` (`2c9ca2b` is this feature's first commit) returns **empty** — proof, not assertion, that no token value and no existing primitive's variant/status vocabulary changed across all of F22. No Flutter mirroring work was needed, and none was done. `flutter analyze` (0 issues) and `flutter test` (39/39) re-confirmed nothing regressed on the mobile side either.
- **AC re-check found one real gap, fixed on the spot:** acceptance criterion "the help card renders with static content and exposes no link" had no test naming it directly (existing tests covered the chip, the icons, the delete control, but not this one). Added `the_help_card_is_static_with_no_link` to `settings-status.spec.tsx` — asserts the card's text is present and `queryAllByRole('link')` is empty. This is exactly the kind of gap Step 6 (Final Verification) exists to catch before claiming success, not after.
- One test-naming deviation from spec.md's plan, not a coverage gap: the AC "delete is icon-only with an accessible name, keyboard and screen-reader reachable" doesn't have a test literally named `the_delete_control_is_icon_only_with_an_accessible_name` — it's covered by `offers_replace_rather_than_add_once_a_key_exists` (asserts the button's accessible name via `getByRole('button', { name: 'Delete Gemini key' })`, which is an ARIA-tree query and therefore a real proxy for screen-reader reachability) and `deleting_returns_the_card_to_its_empty_state` (exercises clicking it). Not renamed, to avoid disturbing tests inherited from before this feature.
- Full-suite validation, run fresh across the whole repo, not filtered to touched files: `pnpm -r typecheck` ✅, `pnpm lint` ✅ (0 warnings), `apps/web` test ✅ 76/76, `packages/design-tokens` test ✅ 17/17, `apps/mobile` analyze ✅ + test ✅ 39/39. `apps/api` test: 50/50 non-container tests pass; the same 5 testcontainers-backed integration suites soft-fail with "Could not find a working container runtime strategy" as in every prior check this session — confirmed non-regressive: `git diff --stat 2c9ca2b^ HEAD -- apps/api/` is also empty, so nothing in this feature touched the API at all.
- Component Overview walk-through: every concrete file path named in `spec.md` exists on disk (verified mechanically, not by re-reading the table) — 34 literal paths plus the two glob patterns (`apps/web/src/components/ui/icons/*.tsx` → 9 files, `apps/mobile/lib/design/widgets/*` → 4 files, both resolving as expected). Nothing missing.
- Dashboard file confirmed untouched across the whole feature: `git diff --stat 2c9ca2b^ HEAD -- "apps/web/src/app/(app)/dashboard/"` is empty.

**Validation:** `pnpm -r typecheck` ✅ · `pnpm lint` ✅ (0 warnings) · `apps/web` test ✅ 76/76 · `packages/design-tokens` test ✅ 17/17 · `apps/mobile` analyze ✅ + test ✅ 39/39 · `apps/api` test: 50/50 non-container ✅, 5 integration suites soft-fail (Docker unavailable, confirmed non-regressive via empty diff on `apps/api/`) · soft-fail: Playwright visual baselines (gallery `icons`/`field`, and the new login screen baseline) not generated this session — Docker unavailable; settings screen visual baseline not written at all — no e2e auth-seeding pattern exists in this repo yet
**Commit:** `d02c8ba` — F22 stage 4 - coverage and verification

## Final verification

**Full-suite validation (6.1), re-run fresh across the whole repo, not filtered to files this run changed:**
- `pnpm -r typecheck` ✅ (design-tokens, shared, web, api)
- `pnpm lint` ✅ 0 warnings (whole repo)
- `apps/web` test ✅ 76/76
- `packages/design-tokens` test ✅ 17/17
- `apps/mobile` `flutter analyze` ✅ 0 issues, `flutter test` ✅ 39/39
- `apps/api` test: 50/50 non-container tests ✅; **5 integration suites soft-failed** (`auth.spec.ts`, `credentials.spec.ts`, `health.spec.ts`, `seed.spec.ts`, `credential-boot-probe.spec.ts`) with "Could not find a working container runtime strategy" — Docker Desktop is not running in this session, the same environment constraint recorded across F03's final verification and every stage of this feature. Confirmed **non-regressive**, not just assumed: `git diff --stat 2c9ca2b^ HEAD -- apps/api/` is empty — this feature made zero changes to the API.

**Component Overview walk-through (6.2):** every concrete file path in spec.md's Component Overview was checked against the real file tree programmatically. 34 literal paths all exist; the two glob-pattern rows resolve to real files (`apps/web/src/components/ui/icons/*.tsx` → 9 icons, `apps/mobile/lib/design/widgets/*` → 4 files, unchanged as expected). **Missing from spec: none.**

**AC re-check (6.3), tests re-run fresh in this pass:**
- ✓ Login fields render leading icons, example address, working reveal — `renders_the_leading_icon_without_announcing_it`, `label_aside_renders_in_the_label_row`, `the_password_can_be_revealed_and_hidden_again`
- ✓ Login contains no excluded affordance — `has_no_register_or_reset_links`
- ✓ Header renders the pill with exactly Dashboard and Settings, active selected, avatar, theme toggle — `the_pill_renders_exactly_the_existing_destinations`, `the_active_destination_is_marked_for_assistive_tech`, `the_avatar_shows_initials_and_announces_the_full_name`
- ✓ Header contains no streak or XP — `the_header_carries_no_streak_or_points`
- ✓ Settings renders the BYOK card, provider icons, masked key as field, region, last-checked — `the_card_leads_with_its_provider_icon`, masked-key assertion in `never_renders_more_than_the_last_four_characters`
- ✓ Status chip reads ready/attention per provider validity — `both_valid_reads_as_ready`, `a_missing_provider_reads_as_attention`, `an_invalid_or_unverified_provider_reads_as_attention`
- ✓ Delete is icon-only with an accessible name, keyboard/screen-reader reachable — `offers_replace_rather_than_add_once_a_key_exists`, `deleting_returns_the_card_to_its_empty_state`
- ✓ Settings contains no copy control, pattern guide, or footer — `no_copy_control_exists`
- ✓ Help card static with no link — `the_help_card_is_static_with_no_link` (added during this final pass)
- ✓ Design document exists, covers four mockups, one status per region — `every_mockup_directory_has_a_table`, `every_region_carries_exactly_one_status`
- ✓ Dropped regions name a Section 6/7 clause — `dropped_regions_cite_an_exclusion`
- ✓ Deferred regions name their owning feature, five dashboard regions present — `deferred_regions_name_an_existing_feature`, `the_deferred_dashboard_regions_are_all_present`
- ✓ No dashboard content implemented or mocked — confirmed via empty `git diff` on the dashboard directory
- ✓ Primitive/token changes reflected in the mirror, gallery and baselines — confirmed via empty `git diff` on `packages/design-tokens/` and `apps/mobile/` (nothing changed, so nothing needed reflecting) plus the `icons` gallery registration from Stage 2
- ✓ Both clients keep the same vocabulary — same empty-diff evidence

**Cross-feature integration:** ✓ per-provider validity from F02 drives the chip, both directions (`a_missing_provider_reads_as_attention`, `both_valid_reads_as_ready`) · ✓ realigned screens compose from F21 tokens/primitives with no raw value (`no-raw-values.spec.ts`, `token-resolution.spec.ts` run clean against every new file, including the one real violation the guard caught and this run fixed — `NavPill`'s `bg-surface-container-high`).

**Environment smoke check (6.4):** `/design-system` and `/login` fetched from a real host `next dev` server — HTTP 200, no error overlay, all expected elements present (Stage 2 and Stage 3 observations have the specifics). `/settings` correctly redirected (HTTP 307) given no live session, confirming the auth gate survived the `SettingsScreen` refactor even though the settings screen's own markup couldn't be inspected live. Two smoke checks could not be exercised and are logged rather than assumed: Playwright visual baselines for the gallery's `icons`/`field` blocks and the new login screen (Docker unavailable all session), and a settings screen visual baseline (no e2e auth-seeding pattern exists in this repo to build one on).

**Soft-fails (consolidated):**
- API's 5 testcontainers-backed integration suites (Docker unavailable) — confirmed non-regressive via empty diff
- Playwright visual baselines: gallery `icons` block, gallery `field` block (now showing `TextField`), and the new login screen — code exists, pixels don't, pending a session with Docker available
- Settings screen visual baseline — not written at all; no e2e auth-seeding pattern exists in this repository yet, and inventing one without a live API to verify it against was judged worse than not writing it
- Settings screen's live HTTP fetch — soft-failed for the same reason (no session available); covered instead by 18 component tests against fixtures (`settings-status.spec.tsx`, extended `credential-card.spec.tsx`)

**Pre-existing failures:** none found attributable to code outside this run's changes.

**Regressions:** none. Every stage's validation passed at commit time; this final pass re-confirms all of it fresh, plus found and fixed one AC-coverage gap (the help card's no-link test) before closing rather than after.

**Status:** `success` — full suite green wherever the environment allows it to run, every Component Overview item present, every testable AC passes fresh, and every unexercised check is an honestly-logged environment or repository-precedent soft-fail rather than a silent gap.

**Follow-up work left open for later sessions:**
- Once Docker Desktop is available: run `pnpm --filter @english-quest/web test:visual -- --update-snapshots` to generate baselines for the gallery's `icons` and `field` blocks and the new login screen, then re-run without the flag to confirm they hold.
- Build an e2e auth-seeding pattern (a storageState fixture seeded from a real login, or a direct signed-cookie helper) so a settings-screen visual baseline — and any future test needing an authenticated page — can be written with something to verify it against.
- Re-run the 5 API integration suites once Docker is available (expected to pass — confirmed nothing in `apps/api` changed since before this feature started).
- The Full Scope addition this feature deliberately deferred: making the settings help card's guide link real (Google AI Studio and Azure Portal console links), replacing the static Core Scope card.
- The five dashboard regions this feature explicitly did not build, each deferred to its owning feature per `design/README.md`: the hero banner and its CTA (F05), the module cards (F05/F06/F15/F18), the recommended-scenario card (F06), the two statistic cards (F20), and the `Scenarios & Practice` nav-pill destination (F06).

**Follow-up added by F19 (2026-09-26), appended — earlier notes above are unchanged:**
- **The header pill now carries `Lessons`** (F19), between Dashboard and Settings and prefix-matched so a lesson's detail keeps it active; F12's `Profile` goes between Dashboard and Lessons. `NavPill` gained `label`, `alwaysVisible` and per-destination `matchPrefix`; `Meter` accepts `delta: null` (em dash, "no previous result") and prints negatives with U+2212. `design/README.md`'s dashboard table records the pill change and F19's `Recent lessons` block (not in the mockup; F05/F07 Experience clauses). The gallery's meter block gained a null-delta row, so its visual baselines change — see F19's progress log for their regeneration.
