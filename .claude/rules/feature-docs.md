---
paths:
  - "docs/**"
---

# Product and feature docs

- `docs/prd.md` defines scope. `docs/context.md` records validated decisions in Portuguese and wins where they disagree. Everything else in `docs/` is in English.
- A feature folder is `docs/F<NN>-<kebab-name>/` with `spec.md` (what and why, component overview, decisions with the alternatives rejected), `plan.md` (stages and steps) and `progress.md` (the implementation log).
- `progress.md` is an append-only record: never delete an earlier observation, deviation, soft-fail or follow-up. Correct it with a dated note instead. Its `**Status:**` line is the feature's status.
- When code later diverges from a finished feature's spec (a fix or a redesign), update the spec, or add a note under that feature's progress follow-ups, so the next reader isn't misled.
- Acceptance criteria are referenced by their PRD wording, not by section number: section numbers move when the PRD grows.
- `docs/api/openapi.json` is generated (`pnpm --filter @english-quest/api openapi:generate`), never edited by hand.
