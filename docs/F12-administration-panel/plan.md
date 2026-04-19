# Implementation Plan: F12. Administration Panel

**Prerequisites:**
- Node.js (matching the Next.js 16 / React 19 scaffold already in `package.json`)
- Docker Desktop running locally (reuses the Postgres container stood up by F02 for development and the testcontainers-based Postgres for integration tests)
- F02 merged (provides the `User` / `Session` tables, `is_admin` / `is_suspended` columns, `getSession()`, `deleteAllSessionsForUser`, the `LogoutButton`, and the integration test harness this feature extends)
- F03 merged (provides the `Video` table with `ON DELETE CASCADE` on `user_id`, the per-user storage layout under `VIDEO_STORAGE_ROOT/<userId>/...`, and the `app/_lib/videos/storage.ts` helpers this feature extends with `removeUserStorageDir`)
- No new runtime dependencies; no new environment variables
- Vitest unit and integration projects already configured; `playwright.config.ts` already references `e2e/` and `e2e/global-setup.ts` — both created by this feature

---

### Stage 1: Data Model and Shared Admin Primitives

**1. Last-login column and migration** - Extend `prisma/schema.prisma` with the nullable `lastLoginAt` column on the `User` model and generate the `add_user_last_login` migration so the Users list can render a real "last login" value per the spec's Data Model section. Wire the column into F02's successful-login path so every subsequent login stamps the timestamp.

**2. Admin guard and admin-scoped library modules** - Introduce `app/_lib/admin/guard.ts`, `app/_lib/admin/checksum.ts`, `app/_lib/admin/metrics.ts`, and `app/_lib/admin/users-query.ts` so the admin gate returns a 404 for non-admins, the optimistic-concurrency checksum is computed consistently on both sides of the action round-trip, and the dashboard and users list get clean, reusable query helpers, as defined in the spec's Component Overview and API Contracts sections.

**3. User-action Server Actions and cleanup orchestrator** - Introduce `app/_lib/admin/user-actions.ts` with the `suspendUser`, `reactivateUser`, and `deleteUser` Server Actions, plus `app/_lib/admin/cleanup.ts` that wraps the cascading database delete and the filesystem cleanup in the failure semantics described in the spec. Extend `app/_lib/videos/storage.ts` with a `removeUserStorageDir` helper so the cleanup module has a single, traversal-safe way to purge a user's bytes from disk.

### Stage 2: Admin Routes and Chrome

**4. Shared admin layout and dashboard** - Introduce `app/admin/layout.tsx` that calls `requireAdmin()` and renders the admin top navigation with Dashboard, Users, and the existing `LogoutButton`, plus `app/admin/page.tsx` as the RSC that renders the two aggregate metric cards for total users and total videos. The layout is what enforces the PRD's "non-admins receive 404" rule for every descendant route.

**5. Users list route and pagination** - Introduce `app/admin/users/page.tsx` that reads and validates the search / sort / direction / page query params, calls `listUsers`, and composes the `UsersSearchInput`, `UsersTable`, and `Pagination` into a complete server-rendered admin view. The page passes the render-time checksum down to the table so every row submits an optimistic-concurrency guard along with the action.

### Stage 3: Interactive Table and Modals

**6. Search, sort, and pagination UI** - Introduce the `UsersSearchInput`, `Pagination`, and `MetricCard` components so the admin can type a substring to filter, click a column header to toggle sort, and move between pages through shareable URLs with preserved state, following the behavior and query-param structure laid out in the spec.

**7. Row actions and delete confirmation** - Introduce the `UsersTable`, `UserActionButtons`, and `DeleteUserModal` components that render the inline suspend/reactivate/delete controls, disable the acting admin's own row server-side and client-side, enforce the case-insensitive email type-through plus 1-second lockout on the delete modal, and surface the "User state has changed — refresh the list" banner when a concurrency conflict is returned by any action.

### Stage 4: Test Coverage

**8. Unit tests for checksum, storage guard, and components** - Implement the unit tests listed in the spec's Testing Strategy for the checksum helper, the new `removeUserStorageDir` storage guard, and the `UsersTable`, `DeleteUserModal`, `UsersSearchInput`, and `Pagination` components so every branch of the concurrency, self-protection, email-gated delete, debounced search, and pagination logic is exercised against the production code.

**9. Integration tests against Postgres + tmpdir storage** - Implement the integration tests listed in the spec for the admin guard, metrics, users-query (search, sort, paginate, video count), user-actions (suspend, reactivate, delete with cascade, self-protection, last-admin, optimistic concurrency), cleanup (DB cascade + filesystem cleanup + filesystem failure path), and the modified `login` Server Action stamping `lastLoginAt`, so every Section 9 acceptance criterion and the Cross-Feature Integration criterion that references F12 are verified end-to-end against a real Postgres instance and a throwaway storage root.

**10. Playwright E2E coverage of interactive criteria** - Create the `e2e/` directory with `global-setup.ts` that seeds admin and regular users into the webServer's Postgres instance, a login helper, and `admin.spec.ts` covering the interactive acceptance criteria — 404 for non-admins, dashboard metrics, users list columns, search/sort/paginate, suspend-then-login-fails, reactivate-then-login-succeeds, self-protection UI, delete with email verbatim, cascade visible in the library, last-admin guardrail, and the concurrent-action banner — so every PRD criterion phrased as "admin clicks / sees / types" is exercised in a real browser against the dev server on the session's `APP_PORT`.
