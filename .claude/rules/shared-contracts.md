---
paths:
  - "packages/shared/src/**"
---

# Shared contracts (`packages/shared`)

This package is the single definition of what crosses the wire. A change here is a change to three clients at once.

- Schemas are Zod v4 and export both the schema and its inferred type. Every schema is exported from `src/index.ts`.
- The consumers import the built `dist/`, so rebuild after every edit: `pnpm --filter @english-quest/shared build`. A stale `dist` makes the API and web typecheck against the old contract.
- When a contract changes, update in the same change:
  - the API route using it, plus its OpenAPI component in `apps/api/src/openapi/components.ts` and the regenerated `docs/api/openapi.json`;
  - the web code importing the type;
  - the hand-written Dart model in `apps/mobile/lib/features/**` that mirrors it.
- Error codes (`src/errors/codes.ts`) carry a code (`AREA###`), an HTTP status and a user-facing message in English. Never renumber or reuse a code: clients switch on it.
- A response schema must not be able to carry another participant's private data. Scope the shape to the caller (for example, `ScenarioView` has `myCard`, never a list of cards).
