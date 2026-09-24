# apps/api: NestJS API

NestJS 11 on Express 5, Prisma 6 on PostgreSQL 16, Redis (sessions, throttling, queues), MinIO through an S3 adapter, LiveKit server SDK, and Gemini via `@google/genai`. The product rules in the root [AGENTS.md](../../AGENTS.md) apply here first. BYOK routing and per-participant privacy are enforced in this app.

## Layout

- One folder per domain under `src/` (`auth`, `credentials`, `prompts`, `classroom`, `scenario`, …). Each has a `*.module.ts`, a thin `*.controller.ts` and services with one job each. For example, in `scenario/`: `scenario.service.ts` holds request policy, `scenario-orchestrator.service.ts` sequences the work, and `situation.service.ts` and `role-card.service.ts` do the generation.
- `common/`: `AppError`, the exception filter and `ZodValidationPipe`. `config/env.ts`: the Zod environment contract, parsed at boot. `openapi/`: Swagger setup, shared components and the snapshot generator.
- A port such as `profile/profile-tags.port.ts` stands in for a feature that isn't built yet. It returns a neutral value in production code. Stubs and fakes belong only in tests.

## Requests and responses

- `SessionGuard` is global, so every route requires a session unless it is marked `@Public()`. Get the caller with `@CurrentUser() user: AuthenticatedUser`.
- Validate input with the shared Zod schema: `@Body(new ZodValidationPipe(schema)) body: Input`.
- A success response is `{ data: … }` (`ApiSuccess<T>` from `@english-quest/shared`).
- Throw failures as `AppError`, via a static factory on `common/app-error.ts`. A new failure mode means a new code in `packages/shared/src/errors/codes.ts` (code, status, message) plus a factory. Controllers never build error bodies.
- **OpenAPI:** every route carries `@ApiTags`, `@ApiOperation` and one `@ApiResponse` per status and error code, with schemas from `openapi/components.ts`. After changing a route or a contract, run `pnpm --filter @english-quest/api openapi:generate` and commit `docs/api/openapi.json`. `test/unit/openapi.spec.ts` fails if the snapshot is stale.

## Data

- Migrations are hand-written SQL in `prisma/migrations/NNNN_snake_case/`, kept in step with `schema.prisma`. See [.claude/rules/prisma-migrations.md](../../.claude/rules/prisma-migrations.md).
- The API applies pending migrations when it boots. To apply one manually: `MSYS_NO_PATHCONV=1 docker compose exec -w /workspace/apps/api api npx prisma migrate deploy`.
- After a schema change, run `npx prisma generate` both on the host (for typecheck and tests) and in the container (for the dev server). Their `node_modules` are separate.
- Prisma JSON null is `Prisma.JsonNull`, not `null`.
- When concurrent requests can race on the same rows (for example, assigning roles to participants), serialize them with `SELECT … FOR UPDATE` inside `prisma.$transaction`.

## AI and credentials

- Never call Gemini directly. Call `PromptExecutionService.execute(userId, promptId, variables)`. It renders the YAML prompt, runs under that user's key through `CredentialExecutorService.withKey`, validates against the prompt's JSON Schema with one correction retry, records telemetry, and returns `{ promptId, promptVersion, model }` for you to store next to the output.
- Pass the `userId` of the person whose data is being processed. That is what enforces the BYOK rule.
- `CRED002` (no usable key) and `CRED003` (undecryptable key) are expected states. Degrade the feature (F06 flags the lesson `no_scenario`) instead of failing the request.
- Slow generation runs in the background. The request awaits only the row it needs to answer with, and background work catches and logs its own errors.
- Prompt authoring rules: [.claude/rules/prompts.md](../../.claude/rules/prompts.md).

## Tests

- Unit tests are in `test/unit/`. Integration tests are in `test/integration/` and run against real Postgres and Redis through Testcontainers, so Docker must be running. Files run serially (`fileParallelism: false`).
- Boot the app for an integration test with `createTestContext()` from `test/integration/helpers/test-app.ts`. Scenario suites use `createScenarioTestContext()` from `helpers/scenario-fixtures.ts`, which also loads the prompt registry (the shared helper doesn't).
- Fake Gemini at the SDK boundary (`helpers/fake-gemini.ts`), not at `PromptExecutionService`, so the vault, retry, telemetry and credential-usage paths run for real. The fake records which API key each call used, which is how the BYOK tests prove key routing.
- A privacy rule is proven by asserting what a response does **not** contain, for every response shape.
