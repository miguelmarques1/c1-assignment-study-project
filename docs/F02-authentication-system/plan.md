# Implementation Plan: F02. Authentication System

**Prerequisites:**
- Node.js (matching the Next.js 16 / React 19 scaffold already in `package.json`)
- Docker Desktop (running locally, for the Postgres container used in dev and integration tests)
- F01 merged (the `getSession()` stub at `app/_lib/session.ts` must exist and be called from `app/page.tsx`; F02 replaces the stub body)
- Dependencies to add (see spec Section 4): `@prisma/client`, `bcryptjs`, `zod`
- Dev dependencies to add: `prisma`, `@types/bcryptjs`, `testcontainers`
- Environment variables (via `.env.local`, copied from `.env.example`): `DATABASE_URL`, `SESSION_SECRET`
- Local Postgres bound to a non-default host port (e.g. `5433`) per project CLAUDE.md
- Vitest harness already bootstrapped in F01 is reused; an integration project is added during Stage 1

---

### Stage 1: Database and Environment Foundation

**1. Docker Compose Postgres service** - Introduce a `docker-compose.yml` at the project root that runs Postgres for local development on a non-default host port so it does not collide with any pre-existing Postgres on the machine. Include a named volume for data persistence and a healthcheck so dependent commands can wait for readiness.

**2. Environment variable bootstrap** - Extend `.env.example` with the two new variables introduced by F02 and document the expected local values. Operators copy the file to `.env.local` per project CLAUDE.md before starting the environment.

**3. Prisma wiring** - Add `prisma` and `@prisma/client` to the project, create the `prisma/schema.prisma` with the Postgres datasource and the two new models described in the spec's Data Model section, and wire `db:generate`, `db:migrate`, and `db:studio` scripts into `package.json`.

**4. Initial migration and Prisma client singleton** - Generate the initial migration that creates the `user` and `session` tables with their indexes, constraints, and foreign keys from the spec, and introduce `app/_lib/db.ts` that exports a single Prisma client instance guarded against HMR re-instantiation.

### Stage 2: Auth Primitives

**5. Validation schemas** - Introduce `app/_lib/validation.ts` that exposes the shared zod schemas for registration and login as defined in the spec, plus a helper that converts zod errors into the field-keyed shape that the forms consume via `useActionState`.

**6. Password module** - Introduce `app/_lib/password.ts` that encapsulates hashing and verification, plus a pre-computed dummy hash used by the login path to keep response timing consistent when the submitted email does not exist.

**7. Cookie helpers** - Introduce `app/_lib/cookies.ts` that centralizes the session cookie attributes and exposes set/clear helpers so every auth entry-point uses identical attributes across dev and production.

**8. Session store** - Introduce `app/_lib/auth/session-store.ts` exposing create, read, refresh, delete, and delete-all-for-user operations against the `session` table as defined in the spec's Data Model and API Contracts.

**9. Session reader replacement** - Replace the F01 stub in `app/_lib/session.ts` with the real reader that combines cookies, the session store, sliding-expiry semantics, and the suspended-user guard to return the typed session object the rest of the app depends on.

### Stage 3: Server Actions and Routes

**10. Register Server Action and route** - Introduce the `register` Server Action in `app/_lib/auth/register.ts`, the `/register` RSC route in `app/register/page.tsx` (including the auto-redirect for already-authenticated visitors), and the client form in `app/register/RegisterForm.tsx` wired to the action with inline per-field error rendering. The action validates input, enforces email uniqueness, hashes the password, creates the user and an initial session, sets the cookie, and redirects to `/app`.

**11. Login Server Action and route** - Introduce the `login` Server Action in `app/_lib/auth/login.ts`, the `/login` RSC route in `app/login/page.tsx` (with the same already-authenticated redirect and a "Create account" link to `/register`), and the client form in `app/login/LoginForm.tsx` that renders a single generic top-of-form error. The action enforces the timing-hardened unknown-email path, rejects suspended users with the same generic error, creates a session on success, and redirects to `/app`.

**12. Logout Server Action and reusable button** - Introduce the `logout` Server Action in `app/_lib/auth/logout.ts` and the `app/_components/LogoutButton.tsx` client component so any future feature can embed a logout trigger. Logout deletes the session row if present, clears the cookie idempotently, and redirects to `/`.

### Stage 4: Test Harness and Coverage

**13. Integration test harness** - Extend the Vitest configuration with an integration project that spins up Postgres via `testcontainers`, applies the Prisma migrations against the throwaway database, and injects the connection string into `process.env` before the test files execute.

**14. Module and component tests** - Implement the unit and component test files listed in the spec's Testing Strategy for `password`, `validation`, `cookies`, `RegisterForm`, `LoginForm`, and `LogoutButton` so that every password rule, every generic-error path, and every rendering branch is exercised.

**15. Integration and end-to-end tests** - Implement the integration test files listed in the spec for `session-store`, `register`, `login`, `logout`, `session`, and the mandatory `auth-flow` round-trip (register → login → logout) so that every Section 9 acceptance criterion for F02 and the cross-feature seams consumed by F12 (admin flag, suspended-login short-circuit) are verified against a real Postgres instance.
