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
**Commit:** _(pending — recorded after this commit lands)_

## Stage 2: Theme Layer and Primitives — ⬜ pending

- [ ] **6. Tailwind adoption**
- [ ] **7. Global stylesheet replacement**
- [ ] **8. Typography and font wiring**
- [ ] **9. Interaction utilities**
- [ ] **10. Primitive components**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 3: Page States, Theming and Documentation — ⬜ pending

- [ ] **11. Page state components**
- [ ] **12. Theme resolution and toggle**
- [ ] **13. Documentation page**
- [ ] **14. Component and theme test suites**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 4: Screen Migration — ⬜ pending

- [ ] **15. Application shell and login**
- [ ] **16. Settings screen**
- [ ] **17. Ad-hoc style removal**
- [ ] **18. Existing suite verification**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 5: Enforcement and Visual Regression — ⬜ pending

- [ ] **19. Accessibility lint**
- [ ] **20. Raw-value and token-resolution guards**
- [ ] **21. Visual regression service**
- [ ] **22. Baseline capture**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_
