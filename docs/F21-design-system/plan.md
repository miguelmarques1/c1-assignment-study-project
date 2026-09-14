# Implementation Plan: Design System

**Prerequisites:**
- F01 implemented — the web client, its Docker service and the authenticated shell exist
- F02 implemented — the settings screen and its credential status vocabulary exist and are what Stage 4 migrates
- `design/english_quest_design_system/DESIGN.md` — the visual direction; its frontmatter is authoritative over its prose
- Node 22, pnpm 9.15.4, the existing workspace at `apps/*` and `packages/*`
- New dependencies: `tailwindcss@^4` and `@tailwindcss/postcss` (web), `@playwright/test` (web, dev), `eslint-plugin-jsx-a11y` (root, dev)
- New Docker image: `mcr.microsoft.com/playwright` for the `visual` service
- Network access at build time for `next/font/google` to fetch Plus Jakarta Sans

---

### Stage 1: Token Source and Generation Pipeline

**1. Design tokens package** - Create `packages/design-tokens` as a workspace package following the structure `packages/shared` already uses, including the build/test tsconfig split that keeps test files out of the compiled output. Wire its scripts into the root `typecheck` and `test` recursion and add a `tokens:build` script.

**2. Token source document** - Transcribe the values from the design reference into `tokens.json`, taking the frontmatter palette as authoritative and adding the derived dark values, the `outline-strong` role and the `neutral` badge status that the spec's Data Model records. This file is the only place any styling value is written. In the same step, correct the reference document's prose so it stops contradicting its own frontmatter, including the radius-name mapping the spec records, since leaving the contradiction in place guarantees somebody reads the wrong palette later.

**3. Token schema and validation** - Define the Zod schema describing the token document and run it as the first step of generation, so a malformed colour, a type step missing its line height or a semantic pair naming an undeclared role stops the pipeline before anything is emitted.

**4. Generator and emitters** - Build the generator and its three emitters producing the Tailwind theme stylesheet, the typed TypeScript module and the Dart theme into the committed `generated/` directory. All three must agree value-for-value, and none of them may contain a literal value of its own.

**5. Token test suite** - Cover the token contract: schema validity, role parity between themes, every registered colour pair against its contrast threshold in both themes, the empty exemption registry, the generation drift guard, and the assertion that dark elevation substitutes a light outline for the hard shadow.

---

### Stage 2: Theme Layer and Primitives

**6. Tailwind adoption** - Add Tailwind v4 and its PostCSS plugin to the web client and verify the engine picks up the generated theme, so that a token defined in `tokens.json` becomes a usable utility without any further configuration.

**7. Global stylesheet replacement** - Replace the contents of `globals.css` with the Tailwind entry point: the framework import, the generated token stylesheet, the data-attribute dark variant and a minimal base layer. Every hand-written class currently in that file is removed in this step, which will break the existing screens until Stage 4 migrates them.

**8. Typography and font wiring** - Load Plus Jakarta Sans in the root layout and bind it to the token font family, so the 13-step type scale renders in the intended typeface across both themes.

**9. Interaction utilities** - Define the two custom utilities carrying the mechanical press physics — rest, hover lift and the active translate that snaps the shadow away — and their reduced-motion behaviour, so no component ever writes a transform or a duration itself.

**10. Primitive components** - Build the eight primitives with the variants, sizes and states the spec's component contracts define, including the type-level guarantees: a button that cannot be icon-only without an accessible name, and layout primitives that only accept token spacing.

---

### Stage 3: Page States, Theming and Documentation

**11. Page state components** - Build Loading, Empty and Error against their contracts, with the skeleton shapes for each loading variant, the single-action constraint on Empty, and the required retry on Error.

**12. Theme resolution and toggle** - Implement the pre-paint theme script, the persistence of an explicit choice and the toggle control, so the system preference is honoured before first paint, an override survives a reload and the active theme is announced.

**13. Documentation page** - Build the browsable page rendering every component with each variant and state, one showcase section per component, each carrying the stable identifier the visual suite clips against. Add its route to the public paths so it opens without a session.

**14. Component and theme test suites** - Cover the primitives, the three page states and theme resolution, including keyboard operability, focus visibility, the assistive-technology semantics of Meter and Field, and the type-level fixtures that fail if a guarantee stops being enforced.

---

### Stage 4: Screen Migration

**15. Application shell and login** - Rebuild the authenticated shell and the login screen from the primitives, keeping every existing behaviour — the lockout countdown, the focus restoration after a failed attempt and the expired-session banner — and placing the theme toggle in the shell.

**16. Settings screen** - Rebuild the credentials screen from the primitives, mapping the four credential statuses onto badge statuses at the call site so the design system stays unaware of credentials, and replacing the bare loading and error paragraphs with the page-state components.

**17. Ad-hoc style removal** - Remove the remaining inline style attributes from the pages and confirm no hand-written class from the previous stylesheet survives anywhere in the web client.

**18. Existing suite verification** - Run the login and credential test suites unchanged and resolve any breakage in the components rather than in the tests, since both suites assert behaviour and accessible names that the migration must preserve.

---

### Stage 5: Enforcement and Visual Regression

**19. Accessibility lint** - Add the accessibility plugin to the lint configuration scoped to the web client, with the rule catching an interactive element that has no accessible name promoted to an error, so the build fails on the case the PRD's error handling names.

**20. Raw-value and token-resolution guards** - Add the source-scanning tests that reject hex literals, arbitrary Tailwind values and dimension-bearing inline styles, and the test asserting every token-shaped utility and CSS variable reference in the web client resolves to a declared token — including a fixture proving the guard can actually fail.

**21. Visual regression service** - Add the Playwright configuration and the containerised service that runs it against the web client inside the compose network, with animations disabled and the theme preset before first paint, so baselines are deterministic and platform-stable.

**22. Baseline capture** - Generate and commit the per-component baselines for both themes, and confirm the suite fails when a component is added to the library without a corresponding showcase section.
