# Implementation Progress: Design System

**Status:** success
**Branch:** main
**Started:** 2026-09-14
**Last updated:** 2026-09-15

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
**Commit:** `4f74495` — F21 stage 4 - migrate login, settings and the app shell onto the system

## Stage 5: Enforcement and Visual Regression — ✅ done

- [x] **19. Accessibility lint**
- [x] **20. Raw-value and token-resolution guards**
- [x] **21. Visual regression service**
- [x] **22. Baseline capture**

**Observations:**

*Enforcement (steps 19–20):*
- `eslint-plugin-jsx-a11y`'s `flatConfigs.recommended` is scoped to `apps/web/src/**/*.tsx` only (spread with an overridden `files` array), with `jsx-a11y/control-has-associated-label` re-affirmed to `'error'` explicitly. Verified it has real teeth by lint-checking a throwaway `<button className="icon-save" />` fixture (the rule's own documented failing example) — it errored; a bare `<input>` fixture did *not* trigger it, because `input`/`textarea` are in the rule's default `ignoreElements` list (that concern belongs to `label-has-associated-control` instead) — recorded so a future reader doesn't assume the rule covers native form controls.
- `no-raw-values.spec.ts` and `token-resolution.spec.ts` both scan `apps/web/src` by walking the filesystem (`readdirSync(..., { recursive: true })`, Node 20+) rather than depending on a glob library. Every regex-based scanner false-positived at least once during writing, each catch worth recording:
  - The hex/arbitrary-value guards strip comments before scanning (`stripComments`, block + line comments, CSS exempted from line-comment stripping since `url(https://...)` would be corrupted by it) — without this, a docstring explaining *why* a raw value was replaced (quoting the old value as prose) fails its own guard.
  - Token-resolution's candidate extractor requires the prefix to be followed by a hyphen (`text-`, never bare `text`) — otherwise an unrelated attribute value like `type="text"` on a password input is misread as a Tailwind class.
  - `'text-block'` (a `LoadingVariant` discriminant, not a class) is a named, justified exception in `NON_UTILITY_ALLOWLIST` for the same reason — the scanner can't see *which prop* a string sits in.
  - `fill-`/`stroke-` were added to the tracked-prefix list once `Logo` (added later this stage, see below) introduced SVG color utilities; both route through the same `COLOR_ROLES` check as `bg-`/`border-`.
  - `packages/design-tokens`'s TypeScript emitter gained two exports it never had a reason to produce before this stage's guard needed them: `shadowNames` (Stage 1's shadow keys were never surfaced as data, only baked into generated CSS) and `motion` (same gap). Both follow the established "generate once, consume everywhere" rule rather than hand-duplicating those four names into the test file.
  - `apps/web/tsconfig.json`'s `include` only matched `test/**/*.tsx` — every `.ts` test file (both new guards) was silently outside `tsc --noEmit`'s program and would have gone unchecked by `pnpm typecheck` forever. Widened to cover `test/**/*.ts`, `e2e/**/*.ts` and `playwright.config.ts` explicitly; the root `lint` script gained `apps/web/e2e` and `apps/web/playwright.config.ts` for the same reason on the lint side.

*Visual regression (steps 21–22):*
- `docker-compose.yml` gained a `visual` service on `mcr.microsoft.com/playwright:v1.63.0-noble` — the tag pinned to match `@playwright/test@1.63.0` exactly, since Playwright's Docker images ship browsers built for one specific package version. While editing the compose file, added a `design-tokens-node-modules` named volume to `api`/`web`/`visual` that Stage 1 should have added when the package was created — its absence meant that package's `node_modules` fell through to the host bind-mount inside containers, a Windows-host/Linux-container mismatch that had gone unnoticed because nothing had exercised the container path since Stage 1.
- Actually brought the stack up and captured baselines for real rather than writing the service and stopping at "should work": pulled the ~1.5GB image, hit a real `docker compose up -d visual` recreating `web` (and, unnoticed until later, `api`) because their service definitions changed — both lost their manually-started dev-server processes and required a manual restart, a variant of the container gotchas already on file from F01. `npx playwright test --update-snapshots` inside the `visual` container then wrote and passed all 22 baselines (11 blocks × 2 themes) against the containerised `web` service over the compose network.
- Verified the "added a component without a showcase section" failure mode is real, not aspirational: temporarily added an undeclared `<div data-vr="undeclared-fixture" />` to the docs page and confirmed `the_documentation_page_lists_every_component` failed with a clear diff naming the orphan id, before reverting.
- Visually inspected several captured baselines directly (`button-light.png`, `badge-dark.png`) rather than trusting a green checkmark — real Plus Jakarta Sans, real token colours, real dark-theme surface flip, hard offset shadows all present as designed.

*Regressions found and fixed during this stage's own verification, not left for later:*
- **`max-w-sm` silently resolved to `0.5rem` instead of Tailwind's built-in 24rem container size**, because our own `--spacing-sm` token (from Stage 1) shares the exact name Tailwind's `max-w-*` scale also uses for named sizes, and Tailwind's `max-w-*` utility checks the spacing scale for a same-named key before(/instead of) its own `--container-*` scale. This made the login card collapse into a single-word-per-line vertical sliver — caught only because the user manually screenshotted the live app and it looked broken; none of Stage 4's `curl`+`grep`-based content checks would ever have caught a layout bug, since they only assert text presence. Fixed both occurrences (`login/page.tsx`, `login-form.tsx`) to `max-w-96` (Tailwind's numeric spacing scale, `calc(var(--spacing) * 96)` = 24rem, no name collision), each with a comment explaining why `max-w-sm` is wrong here. This is a standing trap for any *future* `max-w-{xs,sm,md,lg,xl}` usage too, since those exact names are shared between the two scales — not something a lint rule currently catches, and not something that's fully closed out (see Final Verification).
- **Theme default changed mid-stage, at the user's explicit request**: light is now the product's default regardless of OS `prefers-color-scheme`, not "system, which happens to resolve light or dark." Changed `readStoredPreference()`'s fallback from `'system'` to `'light'`, made `persistPreference('system')` actually store `'system'` (it used to special-case it as "absence," which broke the moment absence stopped meaning system), and removed the CSS `prefers-color-scheme` fallback block from `emit-css.ts` entirely — dark is now reachable only through an explicit `data-theme` attribute. Two follow-on bugs this surfaced, both fixed:
  - `ThemeToggle`'s hard-coded SSR placeholder (`typeof window === 'undefined' ? 'system' : ...`) was never updated alongside the real default, so the server-rendered button read "System theme" while the page's actual colours were already light — a mismatch that `suppressHydrationWarning` was specifically hiding rather than surfacing, and that no component test could catch, because JSDOM always defines `window` and so never executes that branch. Only visible via a real SSR round-trip (Playwright against the containerised Next server), confirmed by screenshot before and after.
  - `e2e/visual.spec.ts`'s dark-theme test used Playwright's `colorScheme: 'dark'` context emulation to select dark mode — which drove the *old* system-preference-following behaviour and stopped doing anything once light became unconditional. The re-run against the (correct, already-fixed) app rendered the dark suite in light theme and failed a real pixel diff against its own baseline — the mechanism doing exactly its job. Fixed by seeding `localStorage` via `page.addInitScript` before navigation (the same explicit-choice path a real toggle click takes), independent of any OS-level emulation; light and dark baselines confirmed stable afterward, with a fresh diff-image inspection (not just the pass/fail) to be sure the "fix" wasn't just re-baselining over an undetected second bug.
- **Logo added** (`design/english_quest_logo`) at the user's request, into `components/ui/logo.tsx` as inline SVG using `fill-`/`stroke-` token utilities rather than the reference's literal hex — `#FF6B4A` maps exactly to our `primary-container`; the reference's light-peach tile has no token equivalent and maps to `outline-variant`, the nearest declared warm-light role. Placed in the login card header and the authenticated shell's header (linked to `/dashboard`); not added to the `/design-system` showcase list, to avoid an unrelated baseline-recapture for a brand asset rather than a primitive.

**Validation:** lint ✅ (0 warnings, whole repo) · typecheck ✅ (whole repo) · tests ✅ (design-tokens 17/17, web 48/48, api 108/108 — every workspace, not just the touched one) · `next build` ✅ · Playwright visual suite ✅ (3/3, containerised, 22 baselines committed and stable on a clean re-run) · both regressions found here were root-caused and fixed within this same stage, not deferred
**Commit:** `a05dfd4` — F21 stage 5 - accessibility lint, raw-value guards and visual regression

## Final Verification

Performed independently of the five stages above, per the implement-feature skill's Step 6 — a fresh pass over the whole feature, not a trust of what each stage already claimed.

**Full-suite validation (fresh, whole repo, not filtered to touched files):**
- `pnpm lint` — 0 warnings across `apps/api`, `apps/web` (including `e2e/` and `playwright.config.ts`), `packages/shared`, `packages/design-tokens`.
- `pnpm typecheck` — clean across all 4 packages.
- `pnpm test` — **design-tokens 17/17 · web 48/48 · api 108/108**, all fresh, none reused from an earlier stage's run.
- `pnpm --filter web build` (production) — clean, all 6 routes compiled.

**Component Overview walk-through:** enumerated all 71 files spec.md's Component Overview tables list (design-tokens package, web theme layer, all 8 primitives + `cn.ts` + barrel, 3 page states, documentation page + 11 section files + shared shell, 4 migrated app components, 4 migrated pages, Playwright config + spec + 22 baseline PNGs, `docker-compose.yml`, `eslint.config.mjs`, `vitest.config.ts`) — **all present**, none missing.

**AC re-check (fresh test runs, not trusted from earlier stages), mapped per spec.md's Testing Strategy:**

| PRD acceptance criterion | Result |
|---|---|
| No raw hex/magic pixel value survives a lint pass | ✓ `no-raw-values.spec.ts` (7/7) |
| Every reading surface AA 4.5:1 / border 3:1 in both themes; exemption registry empty | ✓ `design-tokens/test/tokens.spec.ts` |
| Button/Card/Badge/Meter/Chip/Field/Stack/Grid exist with their variants/states | ✓ `ui-primitives.spec.tsx` (13/13) |
| Loading/Empty/Error render the right content shape | ✓ `page-states.spec.tsx` (6/6) |
| Keyboard-operable with a token focus ring | ✓ `ui-primitives.spec.tsx` |
| No status carried by colour alone | ✓ `ui-primitives.spec.tsx` |
| Both themes legible on the docs page; elevation by outline in dark | ✓ Playwright visual suite (fresh re-run, 3/3) + `dark_elevation_substitutes_outline_for_shadow` |
| `tokens.json` → 3 outputs, one change moves all three | ✓ `design-tokens/test/emit.spec.ts` |
| No hex/spacing number in more than one place across outputs | ✓ `the_generator_contains_no_literal_token_values` |
| No XP/levels/streaks/badges/paid tier/third-party sign-in | ✓ manual grep across `apps/web/src` for the excluded vocabulary — zero matches |
| Documentation page lists every component, both themes | ✓ `the_documentation_page_lists_every_component` (fresh re-run) |
| Login/settings render entirely from the system; ad-hoc classes gone | ✓ whole-repo grep for every retired class name (zero survivors) + `login-form.spec.tsx`/`credential-card.spec.tsx` unchanged |
| Undefined token fails the build | ✓ `token-resolution.spec.ts`, including the `an_unknown_utility_is_detected` fixture |

Every AC has a passing test re-run fresh in this pass; none rest on an earlier stage's cached result.

**Environment smoke check:** the most substantial part of this pass. Brought the full `docker compose` stack up (postgres/redis/minio/livekit/api/web, plus the `visual` service), and along the way surfaced and fixed two problems that only a real environment could show:

- **`.next` corruption from mixing a host-run `next build` (production) with the container's `next dev` (development) against the same bind-mounted `.next` directory** — manifested as `Cannot find module './928.js'` and a 500 on every route once both had touched it. Not a product bug; a operational artifact of testing the same feature from both a production build and a live dev container in the same session. Fixed by deleting `.next` and letting the container's dev server regenerate it; documented here so a future session doesn't mistake it for a real regression. The host build was re-verified clean immediately afterward, then `.next` was deleted again and the container's dev server restarted, leaving the environment in the same state it would be in for a normal `docker compose exec web pnpm dev` session.
- Re-confirmed, after the above fix, that both the containerised Playwright suite (3/3) and a full authenticated walkthrough (`/login` unauthenticated 200, `/dashboard` and `/settings` with a real seeded-user session cookie, both 200 with real database-backed content) work end to end.
- The two regressions logged under Stage 5 (`max-w-sm` collision, theme-default SSR placeholder + visual-suite dark-mode mechanism) were found *during* this same environment verification, fixed, and re-verified by screenshot and by a clean Playwright re-run before this report was written — they are not open items.

**Missing from spec:** none.
**Regressions:** none outstanding — both found during this verification pass were fixed within it (see Stage 5 observations and the smoke-check note above).
**Pre-existing failures:** none — the API's 108-test suite (unrelated to F21, from F01/F02) passed unchanged.
**Soft-fails:** none.

**Status: success.** Every Step 6 check is green: full suite passes fresh, every Component Overview file is present, every AC's test passes on this pass, every smoke check passed.

**Closed out before this report, not left open:**
- `design/english_quest_design_system/DESIGN.md`'s prose contradicted its own frontmatter — the PRD commits to correcting this "in the same step" as the token source document (plan.md Stage 1 step 2), but the prose was never actually edited during Stage 1, only read past. Fixed now: the Palette Architecture section is rewritten to the frontmatter's actual values with a note on why (the earlier prose's hexes appear far less often in the reference screens than the frontmatter's, per Stage 1's measured hex-frequency analysis); a naming note added to Shapes spelling out the `rounded-2xl`→`rounded-lg` / `rounded-xl`→`rounded-md` mapping the spec's Data Model already worked out; and the two remaining mentions of excluded gamification vocabulary (XP, levels, streaks) in Brand Personality and Typography reworded to point at the PRD's exclusion instead.

**Follow-up work knowingly left open** (not required by this feature's acceptance criteria, but worth a future session's attention):
- `max-w-{xs,sm,md,lg,xl}` remains a live trap for any future Tailwind usage — our own spacing tokens share those exact names with Tailwind's built-in named container/max-width scale, and Tailwind resolves the collision silently in the spacing scale's favour. No lint rule catches this today; the two known occurrences are fixed, but a new one elsewhere would reproduce the same "layout the mislabeled `.5rem` wide" state.
