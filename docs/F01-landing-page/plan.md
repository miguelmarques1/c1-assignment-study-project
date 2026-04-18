# Implementation Plan: F01 Landing Page

**Prerequisites:**
- Node.js 20+ and npm (matches the `@types/node` version already in `package.json`)
- Next.js 16.2.4, React 19.2.4, TypeScript 5, Tailwind 4 — all already installed by the scaffold
- `.env.example` duplicated to `.env.local` per project CLAUDE.md (F01 introduces the `.env.example` file but defines no variables yet)
- Dev server port chosen per project CLAUDE.md (default 3000 may be in use — pick the next free port)

---

## Stage 1: Foundation and Visual Baseline

**1. Theme tokens and global stylesheet** — Replace the scaffold's light/dark variables in the global stylesheet with a minimalist HubSpot-inspired token set (neutral background, slate foreground, a single restrained accent for CTAs) and wire the Geist font variables as the default sans. Refer to the spec's Component Overview for which tokens to define and where.

**2. Root layout polish and metadata** — Update the root layout's metadata to the product-accurate title and description while keeping the existing Geist font wiring, `lang="en"`, and the `min-h-full flex flex-col` body shell the landing page depends on.

**3. Session read helper (F02 handoff point)** — Add the session module that exposes an async `getSession()` returning `null` and a `Session` type placeholder. Include a file-level comment flagging this as F02's replacement point, per the spec's Decisions table.

---

## Stage 2: Landing Page Composition

**4. Shared landing components** — Build the presentational components that make up the page (top navigation with the "Log in" link, hero with the "Create account" CTA, "how it works" three-step strip, and footer) under the `app/_components/` private folder. Use semantic landmarks and accessible focus styles as described in the spec.

**5. Landing route with authenticated redirect** — Replace the scaffold page with a server component that first calls the session helper and redirects to `/app` when a session exists, then composes the landing sections in order. Follow the data-flow diagram in the spec's Architecture Impact section.

**6. Remove scaffold remnants** — Delete the unused scaffold SVGs in `public/` that were only referenced by the old page and confirm no dead imports remain.

---

## Stage 3: Verification Setup

**7. Testing toolchain** — Add the component-test toolchain decided in the spec (Vitest + React Testing Library + jsdom + jest-dom matchers) with a minimal config and an npm `test` script. Create the test files enumerated in the spec's Testing Strategy so future features inherit a working harness.

**8. Environment convention** — Create an empty `.env.example` at the project root so the CLAUDE.md workflow of duplicating it to `.env.local` is established from this Foundation feature onward.
