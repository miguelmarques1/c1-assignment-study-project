# Implementation Progress: Local Infrastructure and Authentication

> **Reconstructed retroactively.** F01 was implemented before the `implement-feature`
> skill produced a progress log, so this file was rebuilt on 2026-09-14 from the commit
> history and the run's validation output — not written as the work happened. Step-level
> ticks are inferred from what each commit actually contains. Treat the observations as
> accurate and the moment-by-moment ordering as approximate.

**Status:** success
**Branch:** main
**Started:** 2026-09-14
**Last updated:** 2026-09-14

---

## Stage 1: Repository and Container Foundation — ✅ done

- [x] **1. Workspace Scaffold**
- [x] **2. Compose Stack Definition**
- [x] **3. Development Container Images**
- [x] **4. Environment Contract**

**Observations:**
- App containers start idle (`sleep infinity`) instead of launching a dev server, at the user's request, so a task can bring up only what it needs. `docker compose up api` pulls Postgres, Redis and MinIO through `depends_on` and leaves LiveKit down. This changed the PRD's Experience text and split one acceptance criterion in two.
- Node modules live in named volumes rather than on the bind mount, to keep the Windows host filesystem out of module resolution. The consequence bit later: the container's `node_modules` is **independent from the host's**, so installing a dependency on the host leaves the container without it.
- The MinIO image reference was wrong here and only surfaced when the stack was first started — see Stage 5's observations.

**Validation:** `docker compose config` ✅ · lint/typecheck/tests not yet applicable (no packages existed)
**Commit:** `ecbe1c0` F01 stage 1 - repository and container foundation

---

## Stage 2: API Runtime Core — ✅ done

- [x] **5. Configuration Validation and Fail-Fast Boot**
- [x] **6. Dependency Wait Gate and Migration Runner**
- [x] **7. Database Client and Initial Schema**
- [x] **8. Cache Client**
- [x] **9. Object Storage Adapter**
- [x] **10. Shared Contracts Package**
- [x] **11. Validation Pipe and Error Envelope**

**Observations:**
- `tsconfig.base.json` was written as NodeNext first and switched to **CommonJS**: NestJS 11 with decorators is substantially less risky there, and the shared package had to drop its `.js` import extensions to match.
- Zod 4 API confirmed against current docs before writing: `z.email()` at top level (not `z.string().email()`), `error` replacing `message`, `error.issues` on `safeParse`.
- **Bug found by the tests:** `z.email()` validates *before* a `.transform()`, so `" User@Example.COM "` was rejected instead of normalized. Inverted to normalize first and validate second, in both the shared schema and the seed config. Users type trailing spaces; that is a typo to absorb, not an address to reject.
- Lint was centralized at the repository root rather than duplicated per package, because pnpm gives each package its own `node_modules` and eslint would have to be installed three times.
- `rootDir` was moved from `tsconfig.json` to `tsconfig.build.json` — the typecheck config includes `test/`, which conflicts with a `src`-only root.

**Validation:** lint ✅ · typecheck ✅ · `nest build` ✅ · tests 13/13 ✅
**Commit:** `c904aa8` F01 stage 2 - api runtime core

---

## Stage 3: Authentication — ✅ done

- [x] **12. Password Hashing**
- [x] **13. Session Store**
- [x] **14. Login Throttling**
- [x] **15. Authentication Endpoints**
- [x] **16. Session Guard**

**Observations:**
- Sessions are **opaque tokens backed by Redis**, not JWTs. The PRD asked for a JWT and, in the same breath, for logout to invalidate server-side — which a stateless token cannot do. Under sliding expiry the store is touched on every request anyway, so the JWT would have cost signature verification while saving no round trip. `AUTH_JWT_SECRET` became `SESSION_SECRET`, signing the cookie and preserving the boot guard. The PRD was updated to match.
- Lockout is checked **before** credentials, so a locked address stays locked even when the password is finally correct.
- An unknown email still runs a bcrypt comparison against a fixed dummy hash, computed once at module load at the same cost factor. Returning early would leak account existence through response time. The dummy hash costs roughly 250 ms of CPU at boot.
- The session guard is registered globally, so a route is authenticated unless it opts out with `@Public()` — a new controller cannot be exposed by forgetting a decorator.

**Validation:** lint ✅ · typecheck ✅ · tests 18/18 ✅ (timing-equalization ratio < 1.5×)
**Commit:** `a7ed5f3` F01 stage 3 - authentication

---

## Stage 4: Health and Seeding — ✅ done

- [x] **17. Health Endpoint**
- [x] **18. Seed Command**

**Observations:**
- The same probes feed both `/health` and the boot readiness line, so a slow or missing dependency is visible at startup rather than at first use.
- `/health` answers 503 when anything is down but still returns the full report, so the caller learns *which* dependency failed.
- Seeding is scoped: accounts absent from `SEED_USERS` are never touched, which is what lets a row inserted directly into the database survive every future run.
- A missing schema is detected up front with `to_regclass` rather than letting Prisma throw, so running the seed before the first migration produces guidance instead of a stack trace.

**Validation:** lint ✅ · typecheck ✅ · `nest build` ✅ · tests 18/18 ✅
**Commit:** `d7ed3bc` F01 stage 4 - health and seeding

---

## Stage 5: Web Client Shell and Login — ✅ done

- [x] **19. Application Shell and Route Protection**
- [x] **20. Login Screen**
- [x] **21. Dashboard Placeholder**

**Observations:**
- Route protection is two-layered on purpose: middleware does a cheap cookie-presence check to bounce anonymous requests before render, and the authenticated layout confirms the session against the API on every render. The middleware cannot validate a signed cookie, and the API is the only authority on whether a session is still alive.
- **Bug found by the tests:** the password field is disabled while the request is in flight, and a disabled input cannot take focus — so refocusing it from the `catch` block was a silent no-op that left the user clicking back into the field after every failed attempt. Focus moved into an effect that runs once submission settles.
- `next build` was run as a real runtime check, not just unit tests; it compiles the four routes and the middleware.

**Validation:** lint ✅ · typecheck ✅ · `next build` ✅ · tests 18 API + 5 web ✅
**Commit:** `88e38cf` F01 stage 5 - web client shell and login

---

## Post-stage work

Committed after the five planned stages, while closing the verification gaps:

| Commit | What |
|---|---|
| `bb5657a` | Ignore generated TypeScript and Next artifacts |
| `a7d9462` | Integration suite against real Postgres and Redis — **written but not executed at the time**, because the Docker daemon was unavailable |
| `c539f58` | Fix the MinIO registry and the Nest DI failure on config constructor parameters |
| `2d84444` | Sync spec and plan with what was actually built |
| `8310291` | Ignore the container pnpm store |
| `50c5d09` | Schedule the storage test debt against F07 |
| `cc61496` | OpenAPI document generated from the Zod contracts |

---

## Final verification

**Status: success.** Every check in Step 6 is green, but only after a second pass — the first one ran with the Docker daemon down and could not verify most of the feature.

**Full suite:** lint ✅ · typecheck ✅ · 22 API unit + 5 web component + 25 integration = **52 tests passing**.

**Acceptance criteria:** all 11 verified against the running stack — six containers with the four infrastructure ones healthy, the boot sequence and its readiness line, `/health` returning 200 and then 503 with MinIO stopped, seed idempotency across two runs, the login flow end to end with an HttpOnly cookie, and wrong-password versus unknown-email responses proven byte-identical.

**Three failures only a running stack could surface:**

1. **MinIO is published on quay.io, not Docker Hub.** The stack could not pull `minio/minio` at all. The healthcheck itself was fine — the image carries both `mc` and `curl`, verified by inspecting it.
2. **Nest DI rejects configuration in constructor parameters.** Four services took config with default values (`url: string = env().REDIS_URL`); Nest resolves every constructor parameter as a provider, so the container searched for a `String` provider and aborted at boot. The default value is never reached. Typecheck and unit tests could never have caught this. **This binds every service added by later features** and is recorded in the spec's decisions.
3. **Two integration assertions were passing vacuously.** The session cookie is signed, so its wire value is `s:<token>.<signature>`; using it as a Redis key addressed something that never existed. Two revocation tests asserted "the key is gone after logout" and passed because it was *never there*. The helper now decodes the signature, and those tests assert the key is present before asserting it is absent.

**Still outstanding:** `apps/api/test/integration/storage.spec.ts` does not exist. The storage adapter is exercised indirectly — the API provisions the bucket and prefixes at boot, and `/health` probes MinIO — but round-trip, missing-object and re-provisioning have no automated coverage. This is deliberate debt, **scheduled against F07 Lesson Recording**, the first feature that actually writes objects. Recorded in the spec's Testing Strategy and in project memory.

**Environment notes worth carrying forward:**
- The container has its own `node_modules` volume, independent from the host's. Adding a dependency requires `docker compose exec api pnpm install` as well as the host install — otherwise typecheck passes on the host while the container fails to compile.
- `pkill -f "nest start"` kills the wrapper but not the child holding port 3001. A stale process answered requests for a long stretch while a supposedly-new server was being tested.
