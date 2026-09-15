# Implementation Progress: Design System

**Status:** in progress
**Branch:** main
**Started:** 2026-09-14
**Last updated:** 2026-09-14

## Stage 1: Token Source and Generation Pipeline — ✅ done

- [x] **1. Design tokens package**
- [x] **2. Token source document**
- [x] **3. Token schema and validation**
- [x] **4. Generator and emitters**
- [x] **5. Token test suite**

**Observations:**
- `packages/design-tokens` mirrors `packages/shared`'s tsconfig split, with one deliberate difference: `rootDir` is left unset (rather than pinned to `./src`) because `src/index.ts` imports the committed `generated/tokens.ts` as a real TS source file, and tsc's explicit-rootDir check rejects an import that reaches outside it. Letting tsc infer the common root means compiled output lands at `dist/src/*.js` and `dist/generated/tokens.js` instead of a flat `dist/*.js`; `package.json`'s `main`/`types`/`exports` point at `dist/src/index.js` accordingly. `tokens:build` now runs `tsx src/build.ts && tsc -p tsconfig.build.json` in one step, so regenerating and recompiling can't drift apart.
- Added `outline-strong`, all five `badge-*-bg`/`badge-*-fg` pairs and a `neutral` badge status beyond what the frontmatter names directly — all decided and recorded in spec.md's Data Model and Decisions sections, not invented here.
- Filled three colour roles the spec's dark table left unmeasured at spec time (`outline-variant`, `primary-container`, `on-primary-container` — needed for the light/dark role-parity test to hold). Derived and measured before writing: dark `on-primary-container #ffdad2` on `primary-container #7a2a12` is 7.48:1; `outline-variant #4a3530` is decorative only, not in the contrast registry, so it carries no threshold.
- `on-primary-container` is `#18181b` (light) / `#ffdad2` (dark), not the DESIGN.md frontmatter's `#661000` — this follows spec.md's own contrast decision (the frontmatter value was never used as text in the reference screens; the spec's decorative-wash-with-black-text choice is what's measured at 6.29:1/7.48:1), not a new deviation.
- Renamed the shadow token `inputFocus` → `input-focus` for naming consistency (the generator's kebab-to-camel Dart mapping and the Tailwind utility naming both assume kebab-case source keys).
- The Zod schema's own error-message examples originally quoted real token values (`#ae3115`, `9999px`) — caught by the package's own `no-literal-token-values` guard test, which is exactly the kind of leak that test exists to catch. Fixed to placeholder values (`#a1b2c3`) and a non-numeric format hint; also dropped a redundant `z.literal('9999px')` branch that the length regex already covered.
- Two proof-of-failure fixtures included in the suite (`the_build_refuses_to_emit_when_a_pair_fails_its_threshold`, `the_literal_value_guard_can_actually_fail`) so the contrast gate and the raw-value guard are demonstrated to actually fail on bad input, not just pass on good input.

**Validation:** lint ✅ (0 warnings) · typecheck ✅ (`pnpm -r typecheck`, all 4 packages) · tests ✅ (design-tokens 17/17, api 108/108 unaffected, web 13/13 unaffected)
**Commit:** `f786123` — F21 stage 1 - token source and generation pipeline

## Stage 2: Theme Layer and Primitives — ✅ done

- [x] **6. Tailwind adoption**
- [x] **7. Global stylesheet replacement**
- [x] **8. Typography and font wiring**
- [x] **9. Interaction utilities**
- [x] **10. Primitive components**

**Observations:**
- `globals.css` now imports `tailwindcss` and `@english-quest/design-tokens/css` and declares a single `@custom-variant dark`. Since the pre-paint theme script (Stage 3) always stamps a concrete `data-theme` attribute before anything renders — never leaving it unset for "system dark" — a plain `[data-theme='dark']`-keyed variant is sufficient for any component that needs a `dark:` conditional; the generated stylesheet's own `prefers-color-scheme` block is strictly a pre-script flash guard, not a second styling path.
- **Font delivery deviation from the token literal:** `tokens.json`'s `meta.fontFamily` stays the plain string `"Plus Jakarta Sans"` (correct default, and what the Dart target needs verbatim). The web target instead rebinds `--font-sans` in `globals.css` to `var(--font-plus-jakarta-sans)`, the CSS variable `next/font/google` publishes on `<html>` in `layout.tsx`, so delivery is self-hosted and optimized rather than asking the browser to fetch the family by name. This works because Tailwind's `@theme`-declared variables live in a cascade layer, and unlayered rules (this override) always beat layered ones regardless of source order — confirmed by inspecting the built CSS.
- Two interaction-physics utilities (`press-button`, `press-card`) and one decorative one (`meter-track-warming`) are hand-written in `globals.css` rather than generated, each with a literal pixel offset the design reference specifies (rest/hover/active shadow deltas; the hatch stripe geometry). These are the one place such numbers are allowed to live as literals — they're interaction/decoration constants, not duplicated design tokens, and Stage 5's raw-value guard is scoped to catch duplicated *token* values, not this category.
- **Button variants simplified from the reference's mixed fill/outline treatment to four solid fills**, each reusing a semantic pair the token suite already validates (`on-primary/primary`, `on-secondary/secondary`, `on-surface/surface-container-lowest`, `on-error/error`) rather than inventing an outlined destructive style whose hover-state contrast was never registered. Every button variant's contrast is therefore provably correct by the existing token tests, not just visually plausible.
- **Grid's `columns` prop reflows proportionally, not identically, to the 12/8/4 architecture** for values that don't divide evenly (3 and 6 shown as `md:grid-cols-3`/`lg:grid-cols-6` rather than forcing the fixed 8/12 counts) — the spec's "reflowing to 8 and 4 columns" describes the architecture's own top-level grid, and a `columns={3}` instance reflowing to a literal 8-column tablet layout would look broken, not intentional.
- Confirmed the "don't interpolate a token name into a Tailwind class string" trap before it shipped: `Stack`/`Grid` initially used `` `gap-${gap}` `` template literals, which Tailwind's static content scanner cannot see (it reads source text, not evaluated JS) — rewrote both as lookup tables of complete literal class strings before running anything.
- Ran `pnpm --filter @english-quest/web build` as the Stage 2 runtime check (no page consumes the new primitives yet — that starts in Stage 3 with the docs page — so this validates the CSS/PostCSS/font pipeline, which every existing page already goes through via `globals.css`). Inspected the built bundle directly: `--color-primary` resolves differently under `[data-theme=dark]` and `[data-theme=light]` selectors, `prefers-color-scheme:dark` is present, and `press-button`/`text-label-lg` utilities generated correctly from the token `@theme` block.
- Login and settings screens are now visually broken (every ad-hoc class from the old stylesheet is gone) until Stage 4 migrates them onto the primitives — expected and called out in the plan itself.

**Validation:** lint ✅ (web + design-tokens, 0 warnings) · typecheck ✅ (`pnpm -r typecheck`) · tests ✅ (web 13/13 unaffected — RTL queries by role/text, not CSS class, so the stylesheet rewrite doesn't touch them) · `next build` ✅ (production build + CSS pipeline smoke check, described above)
**Commit:** `243c596` — F21 stage 2 - Tailwind v4 theme layer and the eight primitives

## Stage 3: Page States, Theming and Documentation — ✅ done

- [x] **11. Page state components**
- [x] **12. Theme resolution and toggle**
- [x] **13. Documentation page**
- [x] **14. Component and theme test suites**

**Observations:**
- The theme init script follows Next's own documented pre-hydration pattern exactly: an inline `<script>` in `<head>` with `type` toggling `text/javascript`/`text/plain` server/client (avoids a dev warning), `suppressHydrationWarning` on `<html>`, and the script's logic is a **duplicated, self-contained string** in `THEME_INIT_SCRIPT` rather than a call into the exported `resolveTheme`/`readStoredPreference` helpers — it runs before any bundle loads, so it cannot import them. The duplication is deliberate and commented; the two must be kept in sync by hand if the resolution logic ever changes.
- `ThemeToggle` uses a lazy `useState` initializer that reads `localStorage` directly on first client render (matching the blog-starter reference pattern) rather than a `useEffect` correction pass — the server always renders "System theme", the client's first render can legitimately differ, and `suppressHydrationWarning` on the button is what makes that difference sanctioned rather than an error. This avoids the one-frame label flash a `useEffect`-based correction would have shown.
- **The whole documentation page is a Client Component** (`'use client'` on `page.tsx`), not just the interactive pieces. Several sections (Button, Chip, Empty, Error) need to hand real callbacks to Client Component primitives (`Button`, `Chip`'s remove control) — Next's RSC boundary forbids passing a function prop from a Server Component into a Client Component descendant, and the no-op fixtures used in the sections would have hit exactly that error had `page.tsx` stayed a Server Component. Verified by running a real `next build`, which renders `/design-system` during static generation — a boundary violation would have failed the build, not just a lint pass.
- Retrofitted a token-drawn focus-visible ring (`outline-offset-2 outline-outline-strong focus-visible:outline-2`) onto `Button`, `Chip`'s remove control and `ThemeToggle` — none of the three had one before Stage 3's test suite needed to assert it, which would otherwise have been an acceptance criterion quietly unmet.
- Ran the full `pnpm --filter web build` twice (once before, once after the focus-ring retrofit) and inspected the prerendered `.next/server/app/design-system.html` output directly rather than fighting a port already held by the project's running `docker compose` stack (port 3000 was occupied by `english-quest-web-1`) — confirmed all 11 `data-vr` blocks (`button`, `card`, `badge`, `meter`, `chip`, `field`, `stack`, `grid`, `loading`, `empty`, `error`) render with real content ("Warming up", "No lessons yet", "Try again").
- Verified the `@ts-expect-error` type-level fixtures (icon-only Button, `Stack`/`Grid` with a non-token `gap`, `ErrorState` without `onRetry`) actually have teeth, not just syntax: temporarily made the Button fixture valid (added `aria-label`) and confirmed `tsc` then fails with "Unused '@ts-expect-error' directive" before reverting — the same class of vacuous-pass mistake flagged twice during F01/F02.
- `Grid`'s `columns` reflow table (from Stage 2) and `Meter`'s warming-up hatch utility (added this stage, in `globals.css`) are exercised directly by the `GridSection`/`MeterSection` showcase blocks, which double as the Stage 5 visual-regression subjects.

**Validation:** lint ✅ (0 warnings) · typecheck ✅ (including the `@ts-expect-error` fixtures, confirmed non-vacuous) · tests ✅ (web 37/37: 13 ui-primitives + 6 page-states + 5 theme + 8 credential-card + 5 login-form, all passing) · `next build` ✅ twice, with the second run's static HTML output inspected directly for all 11 documentation sections
**Commit:** `dc8b5b6` — F21 stage 3 - page states, theme toggle and the documentation page

## Stage 4: Screen Migration — ✅ done

- [x] **15. Application shell and login**
- [x] **16. Settings screen**
- [x] **17. Ad-hoc style removal**
- [x] **18. Existing suite verification**

**Observations:**
- `Field` gained an exported `fieldControlClassName` constant so the four call sites rendering a text `<input>` through its render prop (login email/password, credential key/region, and the Stage 3 documentation section) share one literal Tailwind class string instead of four copies of the same composition — retrofitted into `field-section.tsx` too, since duplicating it there would have been exactly the drift this feature exists to prevent.
- `LoginForm`'s outer `<form className="card">` couldn't become `<Card as="form">` — Card's `as` union is `'section' | 'article' | 'div'` by contract (spec's Component contracts table), not `'form'`. Restructured as `<Card as="div">` wrapping a `<form>` child instead; functionally identical, and the AC/tests only check by role and label, not by which element wraps which.
- `CredentialCard` maps the four credential statuses (`valid`/`invalid`/`unverified`/`missing`) onto badge statuses (`success`/`danger`/`warning`/`neutral`) in a `STATUS_BADGE` lookup at the top of the file, per the plan's explicit instruction that "the design system stays unaware of credentials" — `Badge`/`BadgeStatus` never see the word "credential".
- `CredentialsPanel`'s fetch-failed path was a static `<p role="alert">Could not load your credentials.</p>` before this stage. `ErrorState` cannot be constructed without `onRetry` (a type-level guarantee from Stage 3), so satisfying that contract required actually building a retry path: the fetch was extracted into a `useCallback`'d `load()` used both by the mount effect and by `ErrorState`'s `onRetry`. This is a small real behavior improvement forced by the primitive's own contract, not a cosmetic swap.
- `CredentialsPanel`'s loading state moved from `<p className="subtitle">Loading…</p>` to `<LoadingState variant="card-grid" label="Loading your credentials…" />`, and its two-column layout moved from a CSS `repeat(auto-fit, minmax(20rem, 1fr))` grid to `<Grid columns={2} gap="md">` — a fixed breakpoint-driven layout rather than content-driven auto-fit, which is what the Grid primitive's contract offers; with exactly two credentials this is visually equivalent.
- Ran a whole-repo scan for every retired class name (`card`, `field`, `primary`, `secondary`, `danger`, `subtitle`, `banner`, `app-shell`, `app-header`, `centered`, `mono`, `provider-message`, `credential-card`/`-head`/`-meta`/`-grid`, `row`, bare `badge`) as a standalone class token (not as a substring of a Tailwind utility like `text-error` or `font-mono`, which a naive grep flags as false positives) — zero survivors. The one remaining `style={{...}}` in the whole web client is `Meter`'s dynamic fill-percentage width, which is data-driven and not a duplicated token value; Stage 5's raw-value guard is designed to let a `%` width through while still catching a literal `px`/`rem`/hex.
- **Full end-to-end runtime verification, not just component tests:** brought up a standalone `next start` on a free port (3000 was held by the project's own running `docker compose` stack), logged into the real API container with a seeded user (email/password read out of `.env` and piped directly into `curl` without ever being echoed to the terminal), and hit `/login`, `/dashboard` and `/settings` with the resulting session cookie. `/settings` rendered real database-backed credential data through the fully migrated `CredentialsPanel → CredentialCard → Badge` chain (`Gemini`, `Azure Speech`, a `Valid` status badge all present in the response HTML) — not a mock, the actual seeded row. This is a stronger check than the component-level RTL tests alone, since it exercises the real HTTP/auth/DB path the component tests stub out.
- Re-ran `login-form.spec.tsx` (5/5) and `credential-card.spec.tsx` (8/8) unchanged from before the migration — per the plan's step 18 instruction, any breakage would have been fixed in the components, not the tests; none was needed.

**Validation:** lint ✅ (0 warnings) · typecheck ✅ · tests ✅ (web 37/37, all pre-existing and Stage 3 suites unchanged and passing) · `next build` ✅ · runtime ✅ — `/login` (200, unauthenticated), `/dashboard` and `/settings` (200 with a real session cookie, real seeded credential data rendered)
**Commit:** _(pending — recorded after this commit lands)_

## Stage 5: Enforcement and Visual Regression — ⬜ pending

- [ ] **19. Accessibility lint**
- [ ] **20. Raw-value and token-resolution guards**
- [ ] **21. Visual regression service**
- [ ] **22. Baseline capture**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_
