# Implementation Progress: Progress and Evolution Dashboard

**Status:** in progress
**Branch:** claude/progress-evolution-dashboard-d6eb36
**Started:** 2026-10-10
**Last updated:** 2026-10-10

**Run setup:** the worktree is `spec-writer-f13-86d5f2` (branch above), already at `main`'s tip with F12, F15, F21 and F03 closed as `success`. Docker Desktop was off at the start and was started for the run, so Testcontainers suites run. The shared `english-quest` compose stack bind-mounts the main checkout, not this worktree, so it is left untouched; live checks use an isolated stack (see Stage 4).

## Stage 1: Tokens, contract and the progress route — ✅ done

- [x] **1. Chart colour roles**
- [x] **2. Shared contract**
- [x] **3. Progress route**
- [x] **4. Route behaviour and privacy**

**Observations:**
- `tokens.json` gained `chart-1` … `chart-6` in both themes (A14 values) and six `chart-N-on-surface-container-lowest` border pairs at 3:1. All six pass the existing token suite as written, so no value was re-stepped and the exemption registry stays empty. `pnpm tokens:build` rewrites the generated files with LF in a `core.autocrlf=true` checkout; the diff is additions only.
- `DESIGN.md` gained a `Data visualization` subsection under Palette Architecture (CRLF file, written with CRLF).
- `progress.ts` in `packages/shared` follows the spec's table. `measurementSourceKindSchema` duplicates the values of F12's `ledgerSourceKindSchema` on purpose: one describes where a chart point came from, the other where a ledger example did, and they may diverge.
- `ProfileService` is now in `ProfileModule`'s `SHARED` list (provided and exported) instead of being provided separately. `GET /profile` is unchanged.
- `ProgressService.getDashboard` reads the profile and the six histories in parallel (`Promise.all`) with the same `now`.
- The worktree's Prisma client was stale (missing speaking models), so `typecheck` failed until `npx prisma generate` ran in `apps/api`. Setup noise, not part of the change.
- `pnpm openapi:generate` exits 1 silently (the known `tsx` gap), so the snapshot was generated through `pnpm build` and `node dist/openapi/generate.js`. Diff: one operation (`GET /progress`), one component (`ProgressDashboardView`), the `progress` tag.
- Integration tests are the spec's list one for one. `an_activity_outcome_appears_as_an_activity_point` asserts 86 (0.85 × 90 + 0.15 × 60 = 85.5, half up).

**Validation:** typecheck ✅ · lint ✅ · API unit 752/752 ✅ (5 new) · `progress-routes.spec.ts` 13/13 ✅ (Testcontainers) · design-tokens 17/17 ✅
**Commit:** _(see below)_

## Stage 2: Web progress screen — ⬜ pending

- [ ] **5. Chart model**
- [ ] **6. Segmented control primitive**
- [ ] **7. Data layer and route**
- [ ] **8. Chart card**
- [ ] **9. Progress screen and navigation**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 3: Mobile progress screen — ⬜ pending

- [ ] **10. Dart models and chart model twin**
- [ ] **11. Segmented control widget**
- [ ] **12. Chart and legend widgets**
- [ ] **13. Progress screen and routing**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 4: Design reference, verification and hand-off — ⬜ pending

- [ ] **14. Design reference and live verification**
- [ ] **15. Follow-ups for neighbouring features**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_
