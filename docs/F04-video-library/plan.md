# Implementation Plan: F04. Video Library

**Prerequisites:**
- Node.js (matching the Next.js 16 / React 19 scaffold already in `package.json`)
- Docker Desktop running locally (reuses the Postgres container stood up by F02 for dev, and the testcontainers-based Postgres for integration tests)
- F02 merged (provides `getSession()`, the `User` table, Prisma client singleton, cookie helpers, Server Action conventions, integration test harness)
- F03 merged (provides the `Video` table, `VideoDTO`, `VideoStatus`, `findVideoForUser`, `removeVideoDir`, the thumbnail Route Handler, and the F03 upload drop zone/progress list embedded on `/app`)
- No new runtime dependencies are required; F04 reuses `zod`, `@prisma/client`, and the Tailwind theme tokens already in place
- Environment variables (via `.env.local`, copied from `.env.example`): `DATABASE_URL`, `SESSION_SECRET`, `VIDEO_STORAGE_ROOT`, `VIDEO_MAX_BYTES` (all already defined by F02/F03)
- Vitest unit + integration projects from F02; Playwright config from the existing `playwright.config.ts`; CLAUDE.md workflow for per-session database naming

---

### Stage 1: Persistence, Shared Helpers, and Repositories

**1. User library preferences migration** - Extend `prisma/schema.prisma` with the two new columns described in the spec's Data Model section on the existing `User` model, generate the `add_user_library_prefs` migration that adds both columns with safe defaults and CHECK constraints so existing F02 users do not need a backfill and so the grid/list toggle and sort choice have a persistent home from the first request.

**2. Formatting and validation primitives** - Introduce `app/_lib/videos/formatting.ts` with the pure duration/size/upload-date helpers used by the grid and list, `app/_lib/videos/libraryErrors.ts` with the typed error codes consumed by every Server Action, and `app/_lib/videos/libraryValidation.ts` with the zod schemas that each action uses to validate its `FormData` input against the rules in the spec's API Contracts section.

**3. Library-scoped repository and storage wrapper** - Introduce `app/_lib/videos/libraryRepository.ts` with the ownership-scoped Prisma accessors for listing, updating, deleting, resetting status, and persisting preferences, extend `app/_lib/videos/repository.ts` from F03 with the transactional delete helper, and add `removeVideoDirSafely` to `app/_lib/videos/storage.ts` so the delete Server Action can best-effort clean up without throwing on filesystem errors exactly as the spec's Technical Decisions table prescribes.

**4. Library query module** - Introduce `app/_lib/videos/library.ts` exposing `listVideosForUser(userId, sort)` and the `toVideoListItemDTO` mapper so the RSC shell has a single entry point that returns serialized data ready for the client island, including the sort dispatch that translates the three allowed sort keys into the corresponding Prisma `orderBy` clause.

### Stage 2: Server Actions and Routing

**5. Server Actions for mutations** - Introduce `app/_lib/videos/actions.ts` with the five Server Actions described in the spec's API Contracts section — rename, edit description, delete (including the post-commit filesystem cleanup), request retry, and set library preferences — each performing the session check, validating input with the Stage 1 schemas, delegating to the Stage 1 repository, returning a typed state, and calling `revalidatePath('/app')` where applicable.

**6. Library RSC and detail placeholder route** - Rewrite `app/app/page.tsx` to load the session, call `listVideosForUser`, compose the server-rendered shell around the Stage 3 client island (while keeping F03's drop zone and progress list), and introduce `app/app/videos/[id]/page.tsx` as a minimal placeholder route that renders the current processing stage for still-processing rows and a "Detail view coming in F08" marker for ready rows so context-menu "Open" links resolve today.

### Stage 3: Client Library Experience

**7. Status badge, duration overlay, and empty state** - Introduce `app/_components/library/StatusBadge.tsx` mapping each `VideoStatus` to its color and label, `app/_components/library/DurationOverlay.tsx` wrapping the duration formatter for card overlays, and `app/_components/library/EmptyState.tsx` rendering the illustration (ship `public/empty-library.svg`) and the PRD headline so the zero-videos branch has its own component used by both the RSC shell and the client island.

**8. Card, row, grid, and list layouts** - Introduce `app/_components/library/VideoCard.tsx` and `app/_components/library/VideoRow.tsx` as presentational renderers for the two modes, each using the thumbnail URL served by F03, plus `app/_components/library/VideoGrid.tsx` and `app/_components/library/VideoList.tsx` as thin layout wrappers that place the cards and rows in the responsive grid or list geometry described in the spec.

**9. Context menu, rename field, description modal, delete modal** - Introduce `app/_components/library/ContextMenu.tsx` with the keyboard-accessible popover that exposes Open, Rename, Edit description, Delete, and the conditionally-rendered Retry item, `app/_components/library/RenameField.tsx` for the inline title editor wired to the rename action, `app/_components/library/DescriptionModal.tsx` for the textarea modal wired to the description action, and `app/_components/library/DeleteConfirmModal.tsx` with the one-second lock and the `LIB_ALREADY_DELETED` branch wired to the delete action.

**10. Library header and client island** - Introduce `app/_components/library/LibraryHeader.tsx` with the view-mode toggle form and the sort-select form, both posting to the `setLibraryPreferences` action, and `app/_components/library/LibraryClient.tsx` as the one `"use client"` island that receives the initial items and preferences from the RSC, owns the modal open-state, switches between the grid and list layouts based on the current view, and uses `useOptimistic` for the non-destructive rename and description updates.

### Stage 4: Test Coverage and End-to-End Validation

**11. Unit tests for helpers, validation, components, and client island** - Implement the unit tests listed in the spec's Testing Strategy for the formatting helpers, the validation schemas, the DTO mapper and sort dispatch, the presentational components (card, row, status badge, duration overlay, empty state), the interactive components (context menu, rename field, description modal, delete modal, library header), and the library client island so every branch described in the spec has an associated test.

**12. Integration tests for the repository, Server Actions, and the library RSC** - Implement the integration tests listed in the spec for the library repository (ownership-scoped reads and writes), every Server Action (happy + error matrix including the PRD error-handling cases), and the `/app` RSC (authenticated redirect, empty state, correct sort/view rendering), each running against the F02 testcontainers Postgres and using the existing session mock helper.

**13. Playwright coverage of the user-visible acceptance criteria** - Implement `e2e/library.spec.ts` to cover the PRD Section 9 F04 criteria that depend on DOM or navigation — view mode persisting across reload, rename-to-empty inline rejection, delete modal's one-second lock, empty state rendering with the drop zone above it, and the list view showing duration and upload date — so every user-visible acceptance criterion has an end-to-end check that runs against the dev server on the session's assigned port.
