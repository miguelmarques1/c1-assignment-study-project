# Implementation Progress: Design Reference and Visual Realignment

**Status:** in progress
**Branch:** main
**Started:** 2026-09-15
**Last updated:** 2026-09-15

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
**Commit:** _(pending — recorded after this commit lands)_

## Stage 3: Screen Realignment — ⬜ pending

- [ ] **8. Login**
- [ ] **9. Shell header**
- [ ] **10. Settings frame**
- [ ] **11. Credential cards**
- [ ] **12. Credential form**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 4: Coverage and Verification — ⬜ pending

- [ ] **13. Screen baselines**
- [ ] **14. Component tests**
- [ ] **15. Mobile verification**
- [ ] **16. Full verification**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_
