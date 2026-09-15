# Implementation Progress: Mobile Application Shell

**Status:** in progress
**Branch:** main
**Started:** 2026-09-15
**Last updated:** 2026-09-15

## Stage 1: API and Contract Groundwork — ✅ done

- [x] **1. Bearer support in the session guard**
- [x] **2. Mobile token route**
- [x] **3. Shared token contract**
- [x] **4. OpenAPI regeneration**

**Observations:**
- `SessionGuard.extractToken` prefers the signed cookie and falls back to `Authorization: Bearer`; everything past extraction (Redis lookup, sliding expiry, deleted-user check) is untouched, so the two transports share every behavioral guarantee by construction rather than by parallel implementation.
- `POST /auth/token` delegates to the same `AuthService.login` as `/auth/login` — lockout, timing-safety and the credential check are one code path, not two. It returns `{token, expiresAt, user}` and calls `response.cookie` never; verified with a real request that the response carries no `Set-Cookie` header at all.
- **Deviation from spec:** `test/unit/openapi.spec.ts` has a pre-existing guard (`protected_routes_declare_the_session_cookie`) with a hardcoded allowlist of known-public routes (`/auth/login`, `/health`) — not listed in spec.md's Component Overview as a file this stage touches, since I didn't anticipate a *second* guard test needing the new public route added to its own allowlist. Added `post /auth/token` to the allowlist and renamed the test to `protected_routes_declare_a_session_transport` to reflect that a route can satisfy this either way now. Small, obvious fix; logged here rather than silently folded in.
- `@ApiBearerAuth(BEARER_SECURITY_SCHEME)` added alongside every existing `@ApiCookieAuth(SESSION_SECURITY_SCHEME)` — per-route on the three guarded `AuthController` methods (matching how cookie auth was already declared there), class-level on `CredentialsController` (matching how cookie auth was already declared there). Confirmed via the live `/docs-json` document that `GET /auth/me` now lists `[{sessionBearer: []}, {sessionCookie: []}]` — either transport satisfies it.
- OpenAPI grew from 9 to 10 operations, exactly as spec'd; the drift guard (`committed_snapshot_is_up_to_date`) passes against the regenerated `docs/api/openapi.json`.
- Ran a full end-to-end smoke test against the live `docker compose` API container (not just the integration suite): issued a token for a real seeded user, used it as a bearer to call `/auth/me` (200), and confirmed the token-issuing response carries no `Set-Cookie` header. The container's `nest start --watch` did not pick up the host-edited files on its own — same class of file-watching gap seen with Next's dev server during F21 — so the dev process needed an explicit restart before the new route was live; recording this so a future stage doesn't waste time wondering why a route "isn't there yet".

**Validation:** lint ✅ (0 warnings, whole repo) · typecheck ✅ (whole repo) · tests ✅ (api 114/114 — 108 pre-existing + 6 new integration tests for the token route, all fresh; openapi drift guard 4/4) · runtime ✅ — real token issuance, no cookie, bearer-authenticated `/auth/me`, `/docs-json` security schemes both verified live
**Commit:** _(pending — recorded after this commit lands)_

## Stage 2: Token Packaging and Flutter Scaffold — ⬜ pending

- [ ] **5. Design tokens as a pub package**
- [ ] **6. Dart output relocation**
- [ ] **7. Flutter project scaffold**
- [ ] **8. Platform configuration**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 3: Core — Session, Network and Configuration — ⬜ pending

- [ ] **9. Application configuration**
- [ ] **10. Secure session store**
- [ ] **11. HTTP client and interceptors**
- [ ] **12. Error vocabulary**
- [ ] **13. Session lifecycle**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 4: Navigation and the Design System Mirror — ⬜ pending

- [ ] **14. Theme binding**
- [ ] **15. Component mirror**
- [ ] **16. Page states**
- [ ] **17. Module graph and shell**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

## Stage 5: Screens, Recorder and Verification — ⬜ pending

- [ ] **18. Login screen**
- [ ] **19. Settings screen**
- [ ] **20. Credentials screen**
- [ ] **21. Audio recorder service**
- [ ] **22. Device verification**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_
