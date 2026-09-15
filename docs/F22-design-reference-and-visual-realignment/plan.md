# Implementation Plan: Design Reference and Visual Realignment

**Prerequisites:**
- F01 implemented — the login screen, the authenticated shell and the session guard exist
- F02 implemented — the credentials screen and its masked read model are what the settings realignment recomposes
- F21 implemented — the token layer, the primitives and the page-state conventions this feature composes from and narrowly extends
- F03 implemented — the Flutter mirror that the verification phase checks for drift
- No API change, no database change, no OpenAPI regeneration
- F04 (Prompt Library) is a Foundation feature and is still pending; proceeding was confirmed, as it shares no files with this feature

---

### Stage 1: The Design Reference

**1. Mockup analysis** - Walk every region of the four mockups under `design/` and classify each one as implemented, deferred to the feature that owns it, or dropped against the PRD clause that excludes it. This is the analysis the rest of the feature depends on, so it comes before any code.

**2. Reference document** - Write the reference at `design/README.md` as one table per mockup, carrying the region, its owner, its status and the reason. It is the artifact later features read before building their screens, so it must be complete rather than indicative.

**3. Completeness guard** - Add the test that keeps the document honest: every mockup covered, every region carrying exactly one status, every dropped region citing an exclusion and every deferred region naming a feature that exists. Include the negative control the project's other guards all carry.

---

### Stage 2: Library Extensions

**4. Icon set** - Build the icon components as inline SVG following the existing logo component's approach, so they carry token classes rather than raw colour and theme themselves. Each is decorative by default, leaving the accessible name to whatever wraps it.

**5. Text field composition** - Add the composition that pairs the existing field wiring with its control and adornments, covering the leading icon, the label-row aside, the password reveal and the read-only presentation the credential card needs. The existing field primitive gains only its label-row slot and keeps its render-prop contract.

**6. Header pieces** - Build the pill navigation and the initials avatar. The navigation is driven by a list of destinations rather than hardcoded markup, so a later feature adds its destination without touching the header's structure.

**7. Gallery registration** - Surface the new composition and the icon set in the component documentation page, which is what the existing visual baselines and the component-completeness test already cover.

---

### Stage 3: Screen Realignment

**8. Login** - Recompose both fields onto the new composition with their icons, the example address beside the email label and the working reveal, and bring the primary action to the weight the mockup gives it. Lockout behaviour, focus restoration and error copy are preserved exactly as they are.

**9. Shell header** - Replace the text links with the pill and the written name with the avatar, keeping the logo and the theme toggle. The pill carries only the destinations that exist today.

**10. Settings frame** - Give the heading its leading icon, promote the BYOK explanation from a paragraph to a card, derive the aggregate credential state from the list the page already fetches, and render the status chip beside the heading. Mount the help card in its static form.

**11. Credential cards** - Lead each card with its provider icon, present the masked key as a read-only field, and replace the text delete button with the compact icon control carrying its accessible name. The copy control from the mockup is deliberately not built.

**12. Credential form** - Recompose the key entry onto the new composition, keeping the field write-only: paste enabled, autocorrect off, and no reveal, because a stored key is never revealable.

---

### Stage 4: Coverage and Verification

**13. Screen baselines** - Extend the visual suite with full-page baselines for login and settings in both themes, resolving how an authenticated route is reached in the visual run and using a deterministic credential fixture so the settings shot does not drift with real data.

**14. Component tests** - Add the tests for the new composition, the header pieces and the aggregate chip derivation, and extend the existing login and credential-card suites with the realignment assertions and the absence assertions the acceptance criteria require.

**15. Mobile verification** - Confirm whether any token value or any existing primitive's variant or status vocabulary actually changed. Propagate to the Flutter mirror only if something did, and record the finding either way rather than assuming the answer.

**16. Full verification** - Run the raw-value and token-resolution guards, the accessibility lint, both test suites and the analyzer across the repository, confirm the dashboard is untouched in the diff, and confirm the component documentation page still lists every component.
