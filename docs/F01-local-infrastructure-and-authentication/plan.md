# Implementation Plan: Local Infrastructure and Authentication

**Prerequisites:**
- Docker Desktop with Compose v2
- Node 22 LTS and pnpm 9 (only needed on the host for editor tooling; all commands run inside containers)
- Container images: `postgres:16-alpine`, `redis:7-alpine`, `quay.io/minio/minio` (MinIO is not on Docker Hub), `livekit/livekit-server`, `node:22-bookworm-slim`
- Libraries: NestJS 11, Next.js 15, Prisma 6, Zod 4, bcrypt, ioredis, `@aws-sdk/client-s3`, cookie-parser, Vitest 3, Testcontainers
- Environment variables: `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, `SEED_USERS`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `API_PORT`, `WEB_PORT`, `NEXT_PUBLIC_API_URL`
- Configuration files: `pnpm-workspace.yaml`, `docker-compose.yml`, `.env.example`, `livekit.yaml`

---

### Stage 1: Repository and Container Foundation

**1. Workspace Scaffold** - Create the pnpm monorepo with `apps/api`, `apps/web` and `packages/shared` as workspace members, reserving the `apps/mobile` path for the Flutter client that arrives in a later feature. Establish the root manifest, engine pinning and shared TypeScript configuration that both applications extend.

**2. Compose Stack Definition** - Define all six services in a single Compose file, with healthchecks on the four infrastructure containers and dependency ordering so the application containers only start once their backing services report healthy. Configure the LiveKit server with a development key pair through its own configuration file.

**3. Development Container Images** - Build development images for the API and web applications that mount the workspace from the host and keep dependencies in named volumes to avoid host filesystem contention on Windows. Configure both containers to start idle rather than launching a dev server, so the developer chooses what to run.

**4. Environment Contract** - Author the example environment file documenting every variable the stack reads, with working local defaults for the infrastructure services and placeholders for the secrets. Document in the README the exec-based commands for starting each dev server, running migrations and seeding.

---

### Stage 2: API Runtime Core

**5. Configuration Validation and Fail-Fast Boot** - Parse and validate the process environment against a schema before anything connects, exiting with the offending variable named when validation fails. This is what enforces the session secret length guard the specification requires.

**6. Dependency Wait Gate and Migration Runner** - Implement the startup sequence that polls the database and cache until they answer or the timeout elapses, then applies pending migrations before the server accepts traffic. A failure at either step must terminate the process rather than serve requests against an unready stack.

**7. Database Client and Initial Schema** - Set up the Prisma client as an injectable service with proper connection teardown, and author the initial migration creating the users table with its uniqueness and normalization guarantees described in the specification.

**8. Cache Client** - Provide the Redis connection as an injectable service with the key helpers that sessions and login throttling will build on, including connection retry behaviour consistent with the boot gate.

**9. Object Storage Adapter** - Implement the S3-compatible adapter and have it provision the bucket and prefix layout at boot, idempotently. Confine every storage-provider detail to this module so later features never import a cloud SDK directly.

**10. Shared Contracts Package** - Define the authentication schemas, the error code registry and the response envelope types in the shared package, so the API and the web client validate against one definition rather than two.

**11. Validation Pipe and Error Envelope** - Wire the request validation pipe that reads shared schemas and the global exception filter that renders every failure into the standard envelope. Together these establish the request and error conventions that all nineteen remaining features inherit.

---

### Stage 3: Authentication

**12. Password Hashing** - Implement hashing and verification at the configured cost factor, including the constant-work path taken when the supplied email matches no account, so response timing cannot reveal whether an account exists.

**13. Session Store** - Implement session issuance, lookup, sliding renewal and revocation against the cache, including revoking every session belonging to a user. This is the mechanism that makes logout and user deletion take effect immediately.

**14. Login Throttling** - Implement the per-email failure counter and lockout window, keyed so that counters survive an API restart and raw addresses are not stored as keys. The lockout must apply regardless of whether the submitted password is correct.

**15. Authentication Endpoints** - Build the login, logout, current-user and password-change routes, orchestrating throttling, credential verification and session lifecycle. Password change must evict the user's other sessions while preserving the caller's.

**16. Session Guard** - Register a guard that authenticates every route by default and an opt-out marker for the public ones, resolving the cookie to a live session and rejecting absent, expired and orphaned sessions with the specified response.

---

### Stage 4: Health and Seeding

**17. Health Endpoint** - Implement the public endpoint that probes each infrastructure dependency independently, measuring latency and reporting failures individually, and that signals an unhealthy status code when any probe fails while still returning the full report.

**18. Seed Command** - Build the standalone seed entry point that reads the account list from configuration and upserts by normalized email, leaving accounts it does not manage untouched. It must detect an uninitialized schema and exit with the guidance message rather than a database stack trace.

---

### Stage 5: Web Client Shell and Login

**19. Application Shell and Route Protection** - Create the root layout, global styles and the authenticated route group, with middleware that redirects unauthenticated requests to the login route. Establish the API client that carries credentials on every request and converts an authentication failure into a redirect carrying the session-expiry notice.

**20. Login Screen** - Build the login route and its form with client-side validation against the shared schema, submit-in-progress feedback, the generic failure state that clears and refocuses the password field, and the lockout state with its countdown. The screen must offer no registration or recovery affordance, since neither exists in the API.

**21. Dashboard Placeholder** - Add the authenticated landing route that a successful login redirects to, serving as the mounting point that later features extend.
