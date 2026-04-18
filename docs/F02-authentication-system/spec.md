# F02. Authentication System — Technical Specification

**Scope tag:** full scope — no Core/Full split (PRD has neither a `Core Scope` block nor a `Full Scope additions` block for F02, so the entire feature definition is in scope)

**Complexity:** medium

---

## 1. Technical Overview

**What:** Implement the end-to-end authentication system that lets visitors register, log in, and log out. F02 is a Foundation feature: it introduces the Postgres database, the Prisma ORM, the initial migration, the `User` and `Session` tables, password hashing, a cookie-backed session store, and the shared `getSession()` reader consumed by every authenticated route. Three routes are shipped to satisfy the PRD: `/register` (form + Server Action), `/login` (form + Server Action), and a logout Server Action callable from any authenticated page. After successful registration or login, the user is auto-redirected to `/app`; logout clears the session cookie and the `Session` row, then redirects to `/`.

**Why:** Every feature past F01 depends on "who is the current user?" and on a database to persist state. F02 owns the bootstrap for both: it stands up the Prisma client, the first migration, and the session reader at `app/_lib/session.ts` that F01 shipped as a stub. The rest of the app (F03 uploads, F04 library, F12 admin) then consumes the same session object without re-inventing auth. The PRD explicitly calls F02 out as the Foundation feature that "scaffolds the database and ORM setup (Prisma schema, initial migration), session middleware, and auth wiring used by every authenticated route" (Section 8). Sessions are opaque server-side records (not JWTs) so that F12's "suspend user → invalidate active sessions" requirement is a single `DELETE FROM session WHERE user_id = ...` with no revocation lists or token rotation gymnastics.

**Scope:**

Included:
- Postgres database bootstrapped via Docker Compose for local development
- Prisma ORM with `schema.prisma` and the initial migration that creates `User` and `Session` tables
- Prisma client singleton at `app/_lib/db.ts`
- `User` table with `name`, `email`, `password_hash`, `is_admin`, `is_suspended`, timestamps
- `Session` table with opaque session ID, `user_id`, `expires_at`, `absolute_expires_at`, timestamps
- Server Actions for `register`, `login`, and `logout` using Next.js App Router server-action progressive enhancement
- `/register` route with a RSC form page and inline per-field validation errors
- `/login` route with a RSC form page and a generic error message on failed credentials
- Logout Server Action (imported from any route that needs a logout button; a `/logout` POST route is NOT introduced — Server Actions are the convention)
- Cookie-backed session: signed, HttpOnly, Secure (prod), SameSite=Lax, name `videomax_session`, containing the opaque session ID
- Password hashing with `bcryptjs` at cost factor 12; `password_hash` column sized to also accommodate a future `argon2id` migration (60 chars for bcrypt, 128+ for argon2id → use `varchar(255)`)
- `zod` schemas for registration and login payload validation, shared between Server Action and test code
- Real implementation of `app/_lib/session.ts` that reads the cookie, validates the session, refreshes sliding expiry, and returns `{ user: { id, email, name, isAdmin } } | null` — replaces the F01 stub
- Sliding TTL of 30 days refreshed on every authenticated request, with an absolute cap of 60 days
- Timing-hardened login: dummy bcrypt compare when the email is unknown, and a generic "Invalid email or password" error for both unknown-user and wrong-password paths
- Suspended-user login short-circuit: a user with `is_suspended = true` gets the same generic error as a bad password (no disclosure that the account exists but is blocked) — the PRD's F12 "subsequent login attempts are blocked" is satisfied by this path today
- `.env.example` gains `DATABASE_URL` and `SESSION_SECRET`; operators copy to `.env.local` per project CLAUDE.md workflow
- `docker-compose.yml` at project root running Postgres 16 for local development on a non-default port to avoid collision with any existing local database
- Postgres-backed integration test setup via `testcontainers` for hermetic test runs; unit tests reuse the Vitest + RTL harness bootstrapped by F01

Excluded (out of scope per PRD Section 7 or owned by other features):
- OAuth / SSO / magic links / passwordless
- Two-factor authentication
- Email verification after registration (accounts are usable immediately)
- Password recovery / reset (no self-service recovery in MVP)
- Admin UI for user management (F12 owns the `/admin/*` routes; F02 only adds the `is_admin` and `is_suspended` columns so F12 does not need a later migration)
- Rate limiting on login/register (PRD does not require; deferred and documented in Assumptions)
- Login via non-email identifier
- Session management UI ("log out other devices")

---

## 2. Architecture Impact

**Affected components:**

| Path | Role |
|------|------|
| `prisma/schema.prisma` | New — Prisma datasource + `User` and `Session` models |
| `prisma/migrations/<timestamp>_init/migration.sql` | New — initial migration creating both tables, indexes, and constraints |
| `docker-compose.yml` | New — Postgres 16 service for local dev |
| `.env.example` | Modified — add `DATABASE_URL` and `SESSION_SECRET` |
| `app/_lib/db.ts` | New — Prisma client singleton (guards against HMR re-instantiation) |
| `app/_lib/session.ts` | Modified — replace F01 stub; read cookie, validate session row, slide expiry, return typed user |
| `app/_lib/password.ts` | New — `hashPassword`, `verifyPassword` (wraps `bcryptjs` with timing-safe dummy compare) |
| `app/_lib/cookies.ts` | New — central helpers to set/clear the `videomax_session` cookie with consistent attributes |
| `app/_lib/validation.ts` | New — shared zod schemas (`registerSchema`, `loginSchema`) and the formatted-error helper |
| `app/_lib/auth/register.ts` | New — Server Action: validate, check uniqueness, hash, insert user, create session, redirect |
| `app/_lib/auth/login.ts` | New — Server Action: validate, lookup user, dummy-compare if missing, verify password, reject suspended, create session, redirect |
| `app/_lib/auth/logout.ts` | New — Server Action: delete session row, clear cookie, redirect to `/` |
| `app/_lib/auth/session-store.ts` | New — low-level session CRUD: `createSession`, `readSession`, `refreshSession`, `deleteSession`, `deleteAllSessionsForUser` |
| `app/register/page.tsx` | New — RSC form page; imports and invokes the `register` Server Action |
| `app/register/RegisterForm.tsx` | New — `"use client"` form with `useActionState` for inline per-field errors and password-rule feedback |
| `app/login/page.tsx` | New — RSC form page; imports and invokes the `login` Server Action |
| `app/login/LoginForm.tsx` | New — `"use client"` form with `useActionState` for the generic credential error |
| `app/_components/LogoutButton.tsx` | New — small client component that posts to the `logout` Server Action; reusable from the app shell |
| `app/page.tsx` | Not modified by F02 — already calls `getSession()`; the new real implementation makes the redirect work |
| `package.json` | Modified — add `prisma`, `@prisma/client`, `bcryptjs`, `@types/bcryptjs`, `zod`; dev-add `testcontainers`, and `prisma` CLI scripts (`db:generate`, `db:migrate`, `db:studio`) |
| `vitest.config.ts` / test setup | Modified — add a `integration` project with the testcontainers bootstrap |

**Data flow — register:**

```mermaid
graph TD
    Visitor["Visitor hits /register"] --> RegPage["app/register/page.tsx (RSC)"]
    RegPage --> RegForm["RegisterForm (client, useActionState)"]
    RegForm -->|"form submit"| RegAction["register Server Action (app/_lib/auth/register.ts)"]
    RegAction --> ZodR["zod validation (validation.ts)"]
    ZodR -->|"invalid"| InlineErrR["Return field errors to RegisterForm"]
    ZodR -->|"valid"| Uniq["Check email uniqueness in User table"]
    Uniq -->|"exists"| DupErr["Return duplicate-email error"]
    Uniq -->|"free"| Hash["hashPassword via bcryptjs (cost 12)"]
    Hash --> Insert["Prisma User.create"]
    Insert --> CreateSess["createSession in session-store"]
    CreateSess --> SetCookie["Set videomax_session cookie"]
    SetCookie --> RedirectApp["redirect('/app')"]
```

**Data flow — login:**

```mermaid
graph TD
    Visitor["Visitor hits /login"] --> LogPage["app/login/page.tsx (RSC)"]
    LogPage --> LogForm["LoginForm (client, useActionState)"]
    LogForm -->|"form submit"| LogAction["login Server Action (app/_lib/auth/login.ts)"]
    LogAction --> ZodL["zod validation"]
    ZodL -->|"invalid"| InlineErrL["Return generic error"]
    ZodL -->|"valid"| Lookup["Prisma User.findUnique by email"]
    Lookup -->|"not found"| Dummy["verifyPassword against dummy hash (timing-safe)"]
    Dummy --> GenericErr["Return 'Invalid email or password'"]
    Lookup -->|"found + is_suspended"| GenericErr
    Lookup -->|"found + active"| Verify["verifyPassword against stored hash"]
    Verify -->|"mismatch"| GenericErr
    Verify -->|"match"| CreateSessL["createSession + set cookie"]
    CreateSessL --> RedirectAppL["redirect('/app')"]
```

**Data flow — logout + session read:**

```mermaid
graph TD
    Any["Any authenticated page"] --> GetSess["getSession() reads videomax_session cookie"]
    GetSess --> CheckDB["Prisma Session.findUnique by session id"]
    CheckDB -->|"missing or expired or absolute-capped"| ReturnNull["Return null; clear cookie"]
    CheckDB -->|"valid"| Slide["Refresh expires_at (sliding TTL)"]
    Slide --> ReturnUser["Return { user: { id, email, name, isAdmin } }"]
    Any -->|"click Logout"| LogoutBtn["LogoutButton (client)"]
    LogoutBtn --> LogoutAction["logout Server Action"]
    LogoutAction --> DelSess["deleteSession + clear cookie"]
    DelSess --> RedirectHome["redirect('/')"]
```

---

## 3. Technical Decisions

| Decision | Chosen Approach | Alternative Considered | Trade-off |
|----------|-----------------|------------------------|-----------|
| Database | Postgres 16 via Docker Compose for local dev; production uses any managed Postgres | SQLite (single-file) | Postgres is what the PRD explicitly targets and scales horizontally; adds a Docker dependency for local dev but CLAUDE.md already requires that |
| ORM | Prisma | Drizzle, raw SQL + `pg`, Kysely | PRD Section 8 names Prisma directly; Prisma's generated types pair well with App Router RSCs and Server Actions; schema-first migrations are easy to review |
| Migration command | `prisma migrate dev` locally, `prisma migrate deploy` in prod | Raw SQL migrations | Uses Prisma's built-in tooling; no extra migration runner to maintain |
| Password hashing | `bcryptjs` at cost factor 12 | `@node-rs/argon2` (argon2id) | `bcryptjs` is pure JS → no native compile across runtimes; cost 12 is a good 2026 default. `password_hash` column is `varchar(255)` so a future switch to argon2id is a column rewrite, not a schema migration |
| Session strategy | Opaque 32-byte session ID stored in DB, mapped to a signed cookie | JWT in cookie | Opaque IDs satisfy F12's "invalidate active sessions on suspend" with a single `DELETE` query; JWTs would require a revocation list or very short TTLs. Costs one DB lookup per authenticated request (acceptable at MVP scale) |
| Session TTL | 30-day sliding, 60-day absolute cap | Fixed 30-day expiry, or indefinite session | Sliding TTL keeps active users logged in; absolute cap limits damage from leaked cookies. Both stored as columns on the `Session` row so they can be inspected/rotated |
| Cookie attributes | `HttpOnly`, `Secure` in production (off in dev), `SameSite=Lax`, `Path=/`, signed | `SameSite=Strict`, non-signed | Lax keeps external link navigation working; signing prevents cookie tampering even if the DB lookup also re-validates |
| Auth entry-point style | Next.js App Router **Server Actions** | Route handlers at `/api/auth/*` | Server Actions get CSRF protection for free, degrade gracefully without JS, and encourage per-form colocation. They become the default API-style for mutations app-wide |
| Validation | `zod` | `yup`, `valibot`, manual | `zod` is the App Router community default; schemas double as TypeScript types and as form-error sources in `useActionState` |
| Timing-attack protection | Always execute a bcrypt compare on the login path — against a pre-hashed dummy value when the user does not exist — and return the same error shape for unknown email, wrong password, and suspended user | Short-circuit return for unknown email | Mitigates user-enumeration via response timing and via distinct error strings |
| Generic login error | Single string "Invalid email or password" returned for unknown email, wrong password, and suspended account | Distinct errors per case | Matches PRD Section 6 Error Handling; also avoids disclosing that a specific user is suspended (F12 policy piggy-backs on this) |
| Suspended user | Include `is_suspended BOOLEAN NOT NULL DEFAULT false` on `User` now; login path short-circuits; active sessions are deleted when the column is flipped (F12 will wire the UI) | Defer column to F12 | One migration now avoids a column-add + backfill later; the login guard exists today so a manually-flipped suspension works immediately |
| Admin flag | Include `is_admin BOOLEAN NOT NULL DEFAULT false` on `User` now; exposed through `getSession()` | Defer column to F12 | Same reasoning — F12 only needs to add UI, not a migration |
| CSRF | Rely on Next.js Server Actions' built-in origin check | Double-submit cookie | Server Actions already protect against cross-origin POSTs; no extra middleware needed |
| Rate limiting | Deferred; no limiter in MVP | `@upstash/ratelimit`, in-memory sliding window | PRD does not require; documented in Assumptions as a known deferral to revisit after launch |
| Stub replacement strategy | Keep `app/_lib/session.ts` as the exported module; F02 swaps the body (F01 already calls it from `/`) | Introduce a new module `app/_lib/auth.ts` | Preserves F01's call site; no refactor of F01 needed |
| Test DB | `testcontainers` spins up a throwaway Postgres per integration run | Shared dedicated test DB | Hermetic, parallelizable, matches CLAUDE.md's "create a new postgres fresh database using docker" when testing new features. Trade-off is a slower cold start (~2s) per test run |
| Local dev port for Postgres | Non-default host port (e.g. `5433`) mapped to container's 5432 | Default 5432 | CLAUDE.md instructs to look for the next available port since 5432 is often in use |

---

## 4. Component Overview

**Frontend (App Router):**

| File Path | New/Modified | Purpose | Key Responsibilities |
|-----------|--------------|---------|----------------------|
| `app/register/page.tsx` | New | `/register` route (RSC) | Calls `getSession()`; if already authenticated, `redirect('/app')`; otherwise renders the page shell and `<RegisterForm />`; imports the `register` Server Action and passes it down |
| `app/register/RegisterForm.tsx` | New | Client form | `"use client"`; uses `useActionState` to submit the Server Action and render per-field errors inline under `name`, `email`, `password`, `passwordConfirmation`; visually uses the orange accent from F01 for the primary submit |
| `app/login/page.tsx` | New | `/login` route (RSC) | Calls `getSession()`; if already authenticated, `redirect('/app')`; otherwise renders the page shell, `<LoginForm />`, and a "Create account" link pointing to `/register` |
| `app/login/LoginForm.tsx` | New | Client form | `"use client"`; uses `useActionState`; renders a single top-of-form generic error ("Invalid email or password") on failure; no per-field discolosure |
| `app/_components/LogoutButton.tsx` | New | Reusable logout trigger | `"use client"`; a `<form action={logout}>` with a single submit button; consumed by whichever future feature owns the app shell (F04 builds the library chrome, but F02 ships the component) |

**Backend (Server-side modules and Server Actions):**

| File Path | New/Modified | Purpose | Key Responsibilities |
|-----------|--------------|---------|----------------------|
| `app/_lib/db.ts` | New | Prisma client singleton | Exports `prisma`; guards against HMR creating multiple clients by caching on `globalThis` in dev |
| `app/_lib/session.ts` | Modified (replaces F01 stub) | Session reader | Reads the `videomax_session` cookie via `cookies()`; validates the opaque ID against the `Session` row; checks `expires_at` and `absolute_expires_at`; slides `expires_at`; returns `{ user: { id, email, name, isAdmin } } | null`; exports the `Session` and `SessionUser` TypeScript types |
| `app/_lib/password.ts` | New | Password hashing module | `hashPassword(plain)` → bcrypt at cost 12; `verifyPassword(plain, hash)` wraps `bcrypt.compare`; exports a pre-computed `DUMMY_HASH` constant so the login path can execute a timing-matched compare when the user is not found |
| `app/_lib/cookies.ts` | New | Cookie helpers | `setSessionCookie(id)`, `clearSessionCookie()`; central definitions for name (`videomax_session`), `HttpOnly`, `SameSite=Lax`, `Secure` (prod), `Path=/`, and signature handling via `SESSION_SECRET` |
| `app/_lib/validation.ts` | New | zod schemas | Exports `registerSchema` (name 1–120 chars, email RFC-valid via zod's built-in, password 8+ chars and `.regex(/[A-Za-z]/).regex(/[0-9]/)`, passwordConfirmation must equal password — using zod's `.refine`) and `loginSchema` (email + password, minimal). Also exports a `formatZodErrors` helper that returns a `{ fieldName: string[] }` map consumable by `useActionState` |
| `app/_lib/auth/session-store.ts` | New | Session CRUD | `createSession(userId)` → generates 32 random bytes, base64url-encodes, inserts row with 30-day `expires_at` and 60-day `absolute_expires_at`, returns the ID; `readSession(id)`; `refreshSession(id)` (slide `expires_at` if remaining > 1 day, no-op otherwise); `deleteSession(id)`; `deleteAllSessionsForUser(userId)` (consumed by F12 suspend + deletion) |
| `app/_lib/auth/register.ts` | New | Server Action | `"use server"`; validates with `registerSchema`; checks uniqueness with a `prisma.user.findUnique({ where: { email } })`; hashes password; creates user in a transaction with `createSession`; sets cookie; `redirect('/app')`; on uniqueness conflict returns the duplicate-email error; returns a shape consumable by `useActionState` |
| `app/_lib/auth/login.ts` | New | Server Action | `"use server"`; validates with `loginSchema`; fetches user by email; if missing, calls `verifyPassword(submitted, DUMMY_HASH)` then returns generic error; if suspended, returns generic error; if password mismatch, returns generic error; otherwise creates session, sets cookie, `redirect('/app')` |
| `app/_lib/auth/logout.ts` | New | Server Action | `"use server"`; reads cookie; calls `deleteSession`; clears cookie; `redirect('/')` |

**Database:**

| Migration File | Tables Affected | Operation | Notes |
|----------------|-----------------|-----------|-------|
| `prisma/migrations/<timestamp>_init/migration.sql` | `user`, `session` | CREATE | Bootstrap migration for the whole project |

**Infrastructure / config:**

| File Path | New/Modified | Purpose |
|-----------|--------------|---------|
| `prisma/schema.prisma` | New | Datasource (`postgresql`, env `DATABASE_URL`), generator (`prisma-client-js`), `User` and `Session` models |
| `docker-compose.yml` | New | Postgres 16 service bound to a non-default host port; volume for persistence; healthcheck |
| `.env.example` | Modified | Add `DATABASE_URL=postgresql://videomax:videomax@localhost:5433/videomax` and `SESSION_SECRET=change-me-32-bytes-minimum` |
| `package.json` | Modified | Dependencies: `@prisma/client`, `bcryptjs`, `zod`. Dev: `prisma`, `@types/bcryptjs`, `testcontainers`. Scripts: `db:generate`, `db:migrate`, `db:studio` |
| `vitest.config.ts` + `tests/setup/testcontainers.ts` | New/Modified | Integration project with Postgres via testcontainers; env injection; migration application on container start |

---

## 5. API Contracts

F02 uses Next.js App Router **Server Actions** (not REST endpoints). Each Server Action is invoked via a `<form action={serverAction}>` in the client components. The inputs are `FormData`; the outputs are a JSON-serializable state object consumed by `useActionState`. Contracts below describe the logical shapes.

### Server Action: `register`

- **Module:** `app/_lib/auth/register.ts`
- **Invocation:** `<form action={register}>` from `RegisterForm.tsx`
- **Authentication:** Public (rejects with redirect if already authenticated — page-level `getSession()` handles this)

**Request (FormData fields parsed by `registerSchema`):**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `name` | `string` | Yes | 1–120 chars, trimmed | User full name |
| `email` | `string` | Yes | zod `.string().email()`, lowercased before storage | Unique identifier |
| `password` | `string` | Yes | min 8 chars, must match `/[A-Za-z]/` and `/[0-9]/` | Plain-text password (hashed server-side) |
| `passwordConfirmation` | `string` | Yes | must equal `password` | Confirmation |

**Request Example:**
```json
{
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "password": "analytical1",
  "passwordConfirmation": "analytical1"
}
```

**Response (success):** HTTP redirect to `/app` (via `redirect()` — the Server Action throws the Next.js internal redirect; no JSON body returned). Cookie `videomax_session=<opaque-id>` is set.

**Response (validation / business failure):**

| Field | Type | Description |
|-------|------|-------------|
| `ok` | `boolean` | Always `false` on this branch |
| `errors` | `Record<string, string[]>` | Map of field name → list of messages. Keys can be `name`, `email`, `password`, `passwordConfirmation`, or `_form` for non-field errors (e.g., duplicate-email) |

**Response Example (weak password):**
```json
{
  "ok": false,
  "errors": {
    "password": ["Password must contain at least one number"]
  }
}
```

**Response Example (duplicate email):**
```json
{
  "ok": false,
  "errors": {
    "email": ["An account with this email already exists — try logging in"]
  }
}
```

**Error Codes / Messages:**

| Code | Scenario | User-facing message |
|------|----------|---------------------|
| `AUTH_REG_NAME_MISSING` | `name` empty | "Name is required" |
| `AUTH_REG_EMAIL_INVALID` | zod email fails | "Enter a valid email address" |
| `AUTH_REG_EMAIL_TAKEN` | Uniqueness conflict | "An account with this email already exists — try logging in" |
| `AUTH_REG_PW_SHORT` | `<8` chars | "Password must be at least 8 characters" |
| `AUTH_REG_PW_NO_LETTER` | No letter | "Password must contain at least one letter" |
| `AUTH_REG_PW_NO_NUMBER` | No digit | "Password must contain at least one number" |
| `AUTH_REG_PW_MISMATCH` | Confirmation mismatch | "Passwords do not match" |

### Server Action: `login`

- **Module:** `app/_lib/auth/login.ts`
- **Invocation:** `<form action={login}>` from `LoginForm.tsx`
- **Authentication:** Public

**Request:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `email` | `string` | Yes | non-empty; zod email | Account email |
| `password` | `string` | Yes | non-empty | Plain-text password |

**Request Example:**
```json
{
  "email": "ada@example.com",
  "password": "analytical1"
}
```

**Response (success):** HTTP redirect to `/app`; cookie set.

**Response (failure):**

| Field | Type | Description |
|-------|------|-------------|
| `ok` | `boolean` | `false` |
| `errors._form` | `string[]` | Always `["Invalid email or password"]` for unknown email, wrong password, AND suspended user |

**Response Example:**
```json
{
  "ok": false,
  "errors": {
    "_form": ["Invalid email or password"]
  }
}
```

**Error Codes:**

| Code | Scenario | User-facing message |
|------|----------|---------------------|
| `AUTH_LOGIN_INVALID` | Unknown email, wrong password, or suspended user | "Invalid email or password" |
| `AUTH_LOGIN_FIELD_MISSING` | zod validation (missing email or password field) | "Invalid email or password" (still generic; no field disclosure) |

### Server Action: `logout`

- **Module:** `app/_lib/auth/logout.ts`
- **Invocation:** `<form action={logout}>` from `LogoutButton.tsx`
- **Authentication:** Idempotent — works with or without a live session

**Request:** no fields.

**Response:** HTTP redirect to `/`. Cookie `videomax_session` is cleared (Set-Cookie with `Max-Age=0`). Session row is deleted if present.

**Error Codes:** none — logout never returns an error state.

### Session read helper: `getSession()`

- **Module:** `app/_lib/session.ts`
- **Signature:** `async function getSession(): Promise<SessionResult | null>`

**Return shape:**
```json
{
  "user": {
    "id": "clx...",
    "email": "ada@example.com",
    "name": "Ada Lovelace",
    "isAdmin": false
  }
}
```

Returns `null` when:
- cookie is missing,
- cookie signature is invalid,
- session row not found,
- `expires_at < now()`,
- `absolute_expires_at < now()`,
- user is suspended (treat as logged-out).

Side effect: on a valid read, slides `expires_at` forward; on a terminal-expired session, deletes the row and clears the cookie before returning `null`.

---

## 6. Data Model

### Table: `user`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `text` (cuid) | No | `cuid()` via Prisma | Primary key (cuid2 preferred by Prisma default) |
| `name` | `varchar(120)` | No | - | User's full name |
| `email` | `varchar(255)` | No | - | Lowercased email; unique |
| `password_hash` | `varchar(255)` | No | - | bcrypt hash (60 chars); sized to fit argon2id for a future migration |
| `is_admin` | `boolean` | No | `false` | F12 admin gate; exposed via `getSession()` |
| `is_suspended` | `boolean` | No | `false` | F12 suspend flag; login short-circuits when `true` |
| `created_at` | `timestamptz` | No | `now()` | Record creation time |
| `updated_at` | `timestamptz` | No | `now()` | Row update time (Prisma `@updatedAt`) |

**Indexes:**

| Index Name | Columns | Type | Purpose |
|------------|---------|------|---------|
| `pk_user` | `id` | btree (implicit) | Primary key |
| `ux_user_email` | `email` | btree UNIQUE | Login lookup + uniqueness enforcement at registration |

**Constraints:**

| Constraint | Type | Definition | Purpose |
|------------|------|------------|---------|
| `pk_user` | PRIMARY KEY | `id` | Unique identifier |
| `ux_user_email` | UNIQUE | `email` | Enforces registration uniqueness; DB-level safety net beyond the application-level check |

### Table: `session`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `varchar(64)` | No | - | Opaque session ID (base64url of 32 random bytes). This is the value stored in the `videomax_session` cookie |
| `user_id` | `text` | No | - | FK to `user.id` |
| `expires_at` | `timestamptz` | No | - | Sliding expiry; refreshed on each authenticated read (30 days) |
| `absolute_expires_at` | `timestamptz` | No | - | Hard cap (60 days from creation); session invalid past this regardless of sliding |
| `created_at` | `timestamptz` | No | `now()` | Record creation time |

**Indexes:**

| Index Name | Columns | Type | Purpose |
|------------|---------|------|---------|
| `pk_session` | `id` | btree (implicit) | Primary key / direct lookup |
| `ix_session_user_id` | `user_id` | btree | Efficient `deleteAllSessionsForUser` (F12 suspend / delete paths) |
| `ix_session_expires_at` | `expires_at` | btree | Future background cleanup job |

**Constraints:**

| Constraint | Type | Definition | Purpose |
|------------|------|------------|---------|
| `pk_session` | PRIMARY KEY | `id` | Unique session identifier |
| `fk_session_user` | FOREIGN KEY | `user_id REFERENCES user(id) ON DELETE CASCADE` | Deleting a user removes all their sessions |

**Cross-Database Notes:**
- Prisma `cuid()` IDs are portable text IDs — no `uuid-ossp` extension required.
- Use `timestamptz` for all time columns (Postgres default).
- `varchar(255)` for `password_hash` permits a future migration from bcrypt (60 chars) to argon2id (~128 chars) without a schema change.

**Migration Example (`prisma/migrations/<timestamp>_init/migration.sql`):**
```sql
CREATE TABLE "user" (
    "id"              TEXT PRIMARY KEY,
    "name"            VARCHAR(120) NOT NULL,
    "email"           VARCHAR(255) NOT NULL,
    "password_hash"   VARCHAR(255) NOT NULL,
    "is_admin"        BOOLEAN NOT NULL DEFAULT FALSE,
    "is_suspended"    BOOLEAN NOT NULL DEFAULT FALSE,
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX "ux_user_email" ON "user"("email");

CREATE TABLE "session" (
    "id"                    VARCHAR(64) PRIMARY KEY,
    "user_id"               TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "expires_at"            TIMESTAMPTZ NOT NULL,
    "absolute_expires_at"   TIMESTAMPTZ NOT NULL,
    "created_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "ix_session_user_id" ON "session"("user_id");
CREATE INDEX "ix_session_expires_at" ON "session"("expires_at");
```

**Prisma schema snippet (for reference; actual file is generated from this shape):**
```prisma
model User {
  id            String    @id @default(cuid())
  name          String    @db.VarChar(120)
  email         String    @unique @db.VarChar(255)
  passwordHash  String    @map("password_hash") @db.VarChar(255)
  isAdmin       Boolean   @default(false) @map("is_admin")
  isSuspended   Boolean   @default(false) @map("is_suspended")
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  sessions      Session[]
  @@map("user")
}

model Session {
  id                 String   @id @db.VarChar(64)
  userId             String   @map("user_id")
  expiresAt          DateTime @map("expires_at") @db.Timestamptz(6)
  absoluteExpiresAt  DateTime @map("absolute_expires_at") @db.Timestamptz(6)
  createdAt          DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  user               User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId], map: "ix_session_user_id")
  @@index([expiresAt], map: "ix_session_expires_at")
  @@map("session")
}
```

---

## 7. Testing Strategy

F02 reuses the Vitest + React Testing Library toolchain bootstrapped by F01 for unit/component tests. It adds a new **integration** project backed by `testcontainers` so every integration test runs against a freshly migrated Postgres container. This is hermetic and parallelizable.

**Test File Structure:**

| Test File | Test Type | Target | Coverage Goal |
|-----------|-----------|--------|----------------|
| `app/_lib/__tests__/password.test.ts` | Unit | `hashPassword`, `verifyPassword`, `DUMMY_HASH` | 100% of module |
| `app/_lib/__tests__/validation.test.ts` | Unit | `registerSchema`, `loginSchema`, `formatZodErrors` | All branches |
| `app/_lib/__tests__/cookies.test.ts` | Unit | `setSessionCookie`, `clearSessionCookie` | All branches |
| `app/_lib/auth/__tests__/session-store.integration.test.ts` | Integration (Postgres) | `createSession`, `readSession`, `refreshSession`, `deleteSession`, `deleteAllSessionsForUser` | All branches |
| `app/_lib/auth/__tests__/register.integration.test.ts` | Integration | `register` Server Action | All acceptance branches |
| `app/_lib/auth/__tests__/login.integration.test.ts` | Integration | `login` Server Action | All acceptance branches |
| `app/_lib/auth/__tests__/logout.integration.test.ts` | Integration | `logout` Server Action | Happy path + idempotency |
| `app/_lib/__tests__/session.integration.test.ts` | Integration | `getSession` reader | All branches |
| `app/_lib/auth/__tests__/auth-flow.integration.test.ts` | Integration (end-to-end) | register → login → logout round trip | The mandatory cross-action test |
| `app/register/__tests__/RegisterForm.test.tsx` | Unit (component) | `RegisterForm` | Inline error rendering |
| `app/login/__tests__/LoginForm.test.tsx` | Unit (component) | `LoginForm` | Generic error rendering |
| `app/_components/__tests__/LogoutButton.test.tsx` | Unit (component) | `LogoutButton` | Submits to the logout action |

**Per-file test functions:**

`app/_lib/__tests__/password.test.ts`

| Test Function | Description | Assertions |
|---------------|-------------|------------|
| `hash_produces_bcrypt_output` | `hashPassword("abc")` returns a string starting with `$2` and length ≥ 60 | Regex match |
| `verify_true_on_matching_hash` | `verifyPassword("abc", hash)` → `true` | Equality |
| `verify_false_on_mismatching_hash` | `verifyPassword("abc", hash)` → `false` when the input differs | Equality |
| `dummy_hash_is_valid_bcrypt` | `DUMMY_HASH` is a valid bcrypt string that can be fed to `verifyPassword` without throwing | No throw |
| `verify_runtime_matches_within_tolerance_for_hit_vs_miss` | Running `verifyPassword` on the dummy hash vs a real hash takes comparable time (±50%) — soft check | Timing diff under bound |

`app/_lib/__tests__/validation.test.ts`

| Test Function | Description | Assertions |
|---------------|-------------|------------|
| `register_accepts_valid_payload` | All four fields present + valid | Parse succeeds |
| `register_rejects_empty_name` | Empty `name` | Error under `name` key |
| `register_rejects_invalid_email` | Bad email format | Error under `email` |
| `register_rejects_short_password` | 7 chars | Error under `password` with "at least 8 characters" |
| `register_rejects_password_missing_letter` | "12345678" | Error "at least one letter" |
| `register_rejects_password_missing_number` | "abcdefgh" | Error "at least one number" |
| `register_rejects_password_confirmation_mismatch` | Different confirmation | Error under `passwordConfirmation` |
| `login_accepts_valid_payload` | Email + password | Parse succeeds |
| `login_rejects_missing_fields` | Missing password | Error present |
| `format_zod_errors_returns_field_map` | Given a `ZodError`, returns `{ field: string[] }` | Shape matches |

`app/_lib/__tests__/cookies.test.ts`

| Test Function | Description | Assertions |
|---------------|-------------|------------|
| `set_cookie_uses_secure_in_production` | `NODE_ENV=production` | `Secure` attribute set |
| `set_cookie_omits_secure_in_development` | `NODE_ENV=development` | `Secure` attribute omitted |
| `cookie_name_is_videomax_session` | Constant check | Equality |
| `cookie_is_httponly_and_samesite_lax` | Always-on attributes | Both present |
| `clear_cookie_sets_max_age_zero` | Clear sends expiring attributes | Max-Age 0 |

`app/_lib/auth/__tests__/session-store.integration.test.ts`

| Test Function | Description | Assertions |
|---------------|-------------|------------|
| `create_session_returns_base64url_id_and_inserts_row` | Call `createSession(userId)` | Returned ID matches regex `^[A-Za-z0-9_-]{43}$`; row exists in `session` table with correct `user_id`, `expires_at ≈ now+30d`, `absolute_expires_at ≈ now+60d` |
| `read_session_returns_row_when_fresh` | Freshly inserted session | `readSession(id)` returns row |
| `read_session_returns_null_when_expired` | `expires_at < now()` | `readSession` returns `null` |
| `read_session_returns_null_when_absolute_cap_passed` | `absolute_expires_at < now()` even if `expires_at` is still fresh | `readSession` returns `null` |
| `refresh_slides_expires_at_only_if_more_than_one_day_elapsed` | Slide guard | No DB write when session is <1 day old; DB write otherwise |
| `refresh_never_moves_expires_at_past_absolute_cap` | Slide near the cap | `expires_at` is capped at `absolute_expires_at` |
| `delete_session_removes_row` | After `deleteSession`, `readSession` → `null` | Row absent |
| `delete_all_for_user_removes_every_row_for_user` | Create 3 sessions for same user | All 3 gone after one call |

`app/_lib/auth/__tests__/register.integration.test.ts`

| Test Function | Description | Assertions |
|---------------|-------------|------------|
| `register_with_valid_inputs_creates_user_session_and_redirects` | Happy path | `user` row exists; `session` row exists; cookie set; redirect thrown to `/app` |
| `register_rejects_short_password_inline` | Password "abc1" | Returns `{ ok: false, errors: { password: [...] } }`; no user row |
| `register_rejects_password_without_letter_inline` | "12345678" | Returns specific "must contain at least one letter" under `password` |
| `register_rejects_password_without_number_inline` | "abcdefgh" | Returns specific "must contain at least one number" under `password` |
| `register_rejects_duplicate_email` | Pre-seed a user, then register same email | Returns duplicate-email error under `email`; no second user row |
| `register_rejects_duplicate_email_case_insensitive` | Pre-seed `A@X.com`, register `a@x.com` | Rejected |
| `register_rejects_password_confirmation_mismatch` | Different confirmation | Error under `passwordConfirmation`; no user row |
| `register_auto_logs_user_in` | After successful register, `getSession()` from the same cookie returns the new user | User equals registered user |
| `register_stores_password_as_bcrypt_hash_not_plaintext` | Inspect DB | `password_hash` matches bcrypt regex; does not equal plain-text submission |

`app/_lib/auth/__tests__/login.integration.test.ts`

| Test Function | Description | Assertions |
|---------------|-------------|------------|
| `login_success_creates_session_and_redirects_to_app` | Happy path | Session row present; cookie set; redirect `/app` |
| `login_unknown_email_returns_generic_error` | Email not in DB | `errors._form = ["Invalid email or password"]`; no session row |
| `login_wrong_password_returns_generic_error` | Real user, wrong password | Same generic error |
| `login_suspended_user_returns_generic_error` | Real user, correct password, `is_suspended = true` | Same generic error; no session row created |
| `login_uses_dummy_hash_when_user_missing` | Unknown email path | `verifyPassword` is invoked with `DUMMY_HASH`; total response time is within bounded delta of the wrong-password path |
| `login_validates_empty_email_or_password_with_generic_error` | Missing fields | Returns `_form` generic error, NOT field-specific |
| `login_rotates_session_cookie_on_repeat_login` | Existing session cookie + new login | A new `session.id` is issued; previous session row may remain (we do not auto-revoke across devices) |

`app/_lib/auth/__tests__/logout.integration.test.ts`

| Test Function | Description | Assertions |
|---------------|-------------|------------|
| `logout_deletes_session_and_clears_cookie` | Authenticated user calls logout | Session row gone; Set-Cookie clears `videomax_session`; redirect `/` |
| `logout_is_idempotent_when_no_session_cookie_present` | Fresh browser | Still redirects `/`; no throw |
| `logout_is_idempotent_when_cookie_points_to_deleted_session` | Cookie exists, row already deleted | Clears cookie; redirects `/`; no throw |

`app/_lib/__tests__/session.integration.test.ts`

| Test Function | Description | Assertions |
|---------------|-------------|------------|
| `get_session_returns_null_when_cookie_missing` | No cookie | `null` |
| `get_session_returns_user_when_cookie_valid` | Valid session row | `{ user: { id, email, name, isAdmin } }`; `isAdmin = false` by default |
| `get_session_returns_null_when_session_expired` | `expires_at < now()` | `null`; cookie cleared as side effect |
| `get_session_returns_null_when_absolute_cap_passed` | `absolute_expires_at < now()` | `null`; cookie cleared |
| `get_session_returns_null_when_user_suspended` | User `is_suspended = true` | `null` |
| `get_session_slides_expiry_on_valid_read` | Valid session read | `expires_at` advanced forward (subject to the >1-day guard) |
| `get_session_exposes_is_admin_true_for_admin_user` | User row with `is_admin = true` | Returned object has `isAdmin: true` |

`app/_lib/auth/__tests__/auth-flow.integration.test.ts` (mandatory end-to-end test)

| Test Function | Description | Assertions |
|---------------|-------------|------------|
| `register_then_login_then_logout_end_to_end` | Call `register` → simulate a fresh request using the returned cookie → assert `getSession()` returns the new user → call `logout` → assert cookie is cleared and subsequent `getSession()` returns `null`; then call `login` with the same credentials → assert a new session is created → call `logout` again → assert terminal state | Every step asserts both the HTTP-level effect (cookie, redirect) and the DB-level effect (rows created/deleted) |

`app/register/__tests__/RegisterForm.test.tsx`

| Test Function | Description | Assertions |
|---------------|-------------|------------|
| `renders_all_four_fields` | name, email, password, passwordConfirmation | All inputs present |
| `renders_inline_error_under_password_when_action_returns_password_error` | Mock action to return `{ ok: false, errors: { password: ["..."] } }` | Error text renders beneath the password input |
| `submit_button_uses_orange_accent` | Visual identity continuity with F01 | Class list includes the accent button class |

`app/login/__tests__/LoginForm.test.tsx`

| Test Function | Description | Assertions |
|---------------|-------------|------------|
| `renders_email_password_and_create_account_link` | Basic render | All three elements present; "Create account" links to `/register` |
| `renders_generic_error_at_top_of_form_when_action_returns_form_error` | Mock action to return `{ ok: false, errors: { _form: ["Invalid email or password"] } }` | Generic error renders; no field-specific error text present |

`app/_components/__tests__/LogoutButton.test.tsx`

| Test Function | Description | Assertions |
|---------------|-------------|------------|
| `renders_form_with_logout_action` | Form has a submit button labelled "Log out" | Element present |
| `form_posts_to_logout_server_action` | Inspect `action` prop | References the `logout` Server Action module |

**Mapping to PRD Section 9 acceptance criteria:**

| PRD Acceptance Criterion | Covered By |
|---|---|
| User can register with valid name, email, and password | `register_with_valid_inputs_creates_user_session_and_redirects` + `register_auto_logs_user_in` |
| Passwords shorter than 8 characters or missing a letter or number are rejected with inline messages | `register_rejects_short_password_inline` + `register_rejects_password_without_letter_inline` + `register_rejects_password_without_number_inline` + `renders_inline_error_under_password_when_action_returns_password_error` |
| Duplicate email at registration returns a clear error | `register_rejects_duplicate_email` + `register_rejects_duplicate_email_case_insensitive` |
| Login fails with a generic "Invalid email or password" message on wrong credentials | `login_unknown_email_returns_generic_error` + `login_wrong_password_returns_generic_error` + `renders_generic_error_at_top_of_form_when_action_returns_form_error` |
| Successful login redirects the user to `/app` | `login_success_creates_session_and_redirects_to_app` |
| After successful registration the user is automatically logged in and lands on `/app` | `register_with_valid_inputs_creates_user_session_and_redirects` + `register_auto_logs_user_in` |
| Logout terminates the session and redirects to `/` | `logout_deletes_session_and_clears_cookie` + round-trip segment of `register_then_login_then_logout_end_to_end` |

**Mapping to PRD Section 6 (F02) Error Handling:**

| PRD Error Handling rule | Covered By |
|---|---|
| "Invalid credentials at login: show a generic message without disclosing which field is wrong" | `login_unknown_email_returns_generic_error` + `login_wrong_password_returns_generic_error` + `login_validates_empty_email_or_password_with_generic_error` |
| "Duplicate email at registration: show 'An account with this email already exists — try logging in'" | `register_rejects_duplicate_email` |
| "Weak password at registration: show inline rules and which rule failed" | `register_rejects_password_without_letter_inline` + `register_rejects_password_without_number_inline` + `register_rejects_short_password_inline` |

**Cross-Feature Integration criteria (PRD Section 9):** F02 does not appear explicitly in the Cross-Feature Integration list, but every authenticated feature (F03, F04, F05, F06, F08, F09, F10, F11, F12) reads the session produced here. The integration tests above cover that provider contract by asserting `getSession()` returns a consistent `{ user: { id, email, name, isAdmin } }` shape across all paths. Two cross-feature-leaning tests explicitly exercise downstream assumptions:

- `get_session_exposes_is_admin_true_for_admin_user` — satisfies F12's gate requirement (admin vs non-admin).
- `login_suspended_user_returns_generic_error` — satisfies F12's "suspended users cannot log in" requirement ahead of the F12 UI.

---

## 8. Assumptions / Decisions (Auto-Accept)

Because F02 was generated in Batch Mode without an interactive interview, the following decisions were auto-resolved using the spec-writer's Auto-Accept Policy. Each is flagged so the user can review and override.

| # | Decision | Auto-Accept rationale | Policy row |
|---|----------|-----------------------|------------|
| 1 | Scope covers the entire feature definition | PRD has neither `Core Scope` nor `Full Scope additions` blocks for F02 | "Scope (Core vs Core+Full)" — neither block present, assume full scope |
| 2 | Database: Postgres 16 via Docker Compose locally | Per project CLAUDE.md ("create a new postgres fresh database using docker") and PRD Section 8 Foundation description | "Empty codebase bootstrap" — industry best practice for the detected stack |
| 3 | ORM: Prisma | Explicitly named in PRD Section 8 Foundation description ("Prisma schema, initial migration") | "Technical decisions with a clear recommendation" |
| 4 | Migration layer: `prisma migrate dev` (local) / `prisma migrate deploy` (prod) | Prisma's built-in tooling; no extra runner needed | "Technical decisions with a clear recommendation" |
| 5 | Password hashing: `bcryptjs` at cost 12 with `varchar(255)` hash column to permit a future argon2id migration | Pure JS, works across runtimes; cost 12 is a good 2026 default; column sized for future move | "Feature requires new technology not present in the codebase" — documented |
| 6 | Session strategy: opaque 32-byte random session ID stored in DB and referenced from a signed cookie | Satisfies F12's "invalidate active sessions on suspend" with a single DELETE; avoids JWT revocation-list complexity | "Technical decisions with a clear recommendation" |
| 7 | Session TTL: 30-day sliding, 60-day absolute cap | Balance of user convenience vs blast radius of a leaked cookie | "Partial PRD specifications" — industry-standard default, documented for review |
| 8 | Cookie name: `videomax_session`; attributes HttpOnly, Secure (prod), SameSite=Lax, Path=/ | Product-namespaced name; standard secure-cookie defaults | "Partial PRD specifications" |
| 9 | Validation library: `zod` | Community default for App Router; schema doubles as form-error source | "Empty codebase bootstrap" — industry best practice |
| 10 | API style: Next.js App Router Server Actions | Built-in CSRF protection; progressive enhancement; encourages colocation. Becomes the project-wide default for mutations | "Empty codebase bootstrap" — best practice; establishes convention for future features |
| 11 | Replace F01's `app/_lib/session.ts` stub with the real implementation; keep the exported function name and shape | F01 already calls `getSession()` from `/`; F02 can swap the body without touching F01 | "Technical decisions with a clear recommendation" |
| 12 | `User.is_admin BOOLEAN NOT NULL DEFAULT false` added now | F12 will gate `/admin/*` on this flag; cheaper to include today than to add a later migration | "Partial PRD specifications" — extend scope to avoid later migration |
| 13 | `User.is_suspended BOOLEAN NOT NULL DEFAULT false` added now; login short-circuits when `true` | Same rationale as `is_admin`; also means a manually flipped suspension works immediately | "Partial PRD specifications" |
| 14 | Timing-hardened login: run a dummy bcrypt compare when the email is unknown, and return the same generic error for unknown-user, wrong-password, and suspended-user | Prevents user enumeration via response timing and via error-text differences | "Description too vague" — apply security best practice; documented |
| 15 | Return `errors._form = ["Invalid email or password"]` for all three login-failure paths | PRD requires "no field disclosure"; `_form` key keeps the UI message at the form top | "Partial PRD specifications" |
| 16 | Rate limiting is deferred; no limiter in MVP | PRD does not require; documented deferral to revisit post-launch | "Partial PRD specifications" — documented |
| 17 | CSRF relies on Next.js Server Actions' built-in origin check; no additional token plumbing | Server Actions already reject cross-origin POSTs | "Technical decisions with a clear recommendation" |
| 18 | Test DB bootstrap via `testcontainers` | Matches CLAUDE.md "create a new postgres fresh database using docker"; hermetic, parallelizable | "Empty codebase bootstrap" — best practice for integration tests |
| 19 | Local dev Postgres on host port `5433` mapped to container `5432` | CLAUDE.md: "Default one (3000) normally is in use … look for next available port"; same principle applied to Postgres' 5432 | Project convention |
| 20 | Env vars introduced: `DATABASE_URL`, `SESSION_SECRET`. Added to `.env.example` | Operators copy `.env.example` → `.env.local` per CLAUDE.md workflow | Project convention |
| 21 | Primary keys: Prisma `cuid()` (string) for `User`; opaque session ID (base64url) for `Session` | Portable text IDs; no DB extension needed; explicit session ID for cookie round-trip | "Description too vague" — applied best practice |
| 22 | Logout is exposed only through a Server Action, not a REST `/logout` route | Keeps the API-style consistent across all mutations | "Technical decisions with a clear recommendation" |
| 23 | Email is lowercased before storage and lookup | Prevents accidental duplicates; avoids user frustration on case-sensitive mismatches | "Partial PRD specifications" — best practice |
| 24 | `RegisterForm` and `LoginForm` are client components using `useActionState`; page files are RSCs | React 19 / Next.js 16 idiomatic pairing for form actions | "Empty codebase bootstrap" — industry best practice |
| 25 | Auto-authenticated users visiting `/login` or `/register` are redirected to `/app` via a page-level `getSession()` check | Parallels F01's same behavior on `/`; prevents logged-in users from re-registering by mistake | "Description too vague" — best practice |
| 26 | Password confirmation mismatch produces a message under `passwordConfirmation` | PRD lists password rules but is silent on confirmation error placement | "Partial PRD specifications" — placing under the confirmation field is the common UX |
| 27 | Name field length cap at 120 characters | PRD does not specify | "Partial PRD specifications" — reasonable upper bound that fits in `varchar(120)` |
| 28 | Email field length cap at 255 characters | Standard practical limit | "Partial PRD specifications" |

**Traceability — which PRD blocks informed which parts of the spec:**

| PRD block | Where it landed in the spec |
|-----------|------------------------------|
| Section 5 user stories for F02 (register / log in / log out) | Technical Overview (What) |
| Section 6 F02 Capabilities (email+password, rules, hashing, cookie session, logout) | Component Overview, API Contracts, Data Model, Technical Decisions |
| Section 6 F02 Experience (form flows, inline errors, post-register and post-login redirects, logout redirect) | Data flow diagrams + API Contracts + Frontend component list |
| Section 6 F02 Error Handling (generic login error, duplicate-email message, weak-password rules) | Error Codes tables in Section 5 + Testing Strategy mapping |
| Section 7 Out of Scope — Authentication alternatives | Technical Overview (Scope → Excluded) |
| Section 8 F02 Foundation description (Prisma schema, initial migration, session middleware) | Technical Decisions + Data Model + Infrastructure config |
| Section 9 F02 per-feature acceptance criteria | Testing Strategy — direct mapping table at the end of Section 7 |
| Section 9 cross-feature implications (F12 admin gate, F12 suspend flag) | `is_admin` and `is_suspended` columns + suspended-login tests |
| F01's existing `app/_lib/session.ts` stub and call site in `app/page.tsx` | Architecture Impact (replace stub) + Technical Decisions (handoff) |
| Project CLAUDE.md instructions (Postgres Docker, `.env.example` → `.env.local`, non-default port, never commit `launch.json`) | Infrastructure config + Assumptions #18, #19, #20 |
