# Implementation Progress: BYOK Credential Vault

**Status:** success
**Branch:** main
**Started:** 2026-09-14
**Last updated:** 2026-09-14

---

## Stage 1: Data Model and Encryption Core — ✅ done

- [x] **1. Environment Contract**
- [x] **2. Credential Schema and Migration**
- [x] **3. Encryption Service**
- [x] **4. Boot Decryptability Probe**

**Observations:**
- **Deviation:** `credentials.module.ts` was created here rather than in Stage 3 where the plan places module wiring. The boot probe resolves `CredentialCryptoService` from the container before any feature module is constructed, so the module has to exist by the end of this stage. Stage 3 expands it rather than creating it.
- The crypto is split in two: pure functions in `credential-crypto.ts` that take an explicit key, and a thin `@Injectable()` wrapper that binds them to `env().BYOK_MASTER_KEY`. Two reasons — unit tests can exercise two different master keys in the same process, which is the only way to prove a credential is bound to the key that wrote it; and the wrapper keeps the F01 rule that no injectable service takes constructor parameters.
- Boot probe discriminator, since the PRD demands opposite responses without saying how to tell the cases apart: **every** row failing means the master key changed, so the boot stops; **some** rows failing means those rows are corrupt, so they are marked `invalid` and the API starts. One bad row must not take the platform down.
- The `user_credentials_region_ck` constraint means Azure without a region is refused by the **database**, not only by application validation. It cannot be stored in an unusable state even by a direct insert.
- Adding `BYOK_MASTER_KEY` broke four existing `env.spec.ts` tests whose fixture predates it. Fixture updated and two tests added for the new guard — notably the valid-base64-but-16-bytes case, which would otherwise surface much later, at the first attempt to build an AES-256 cipher.
- `.env.example` documents what the variable is *not*: it carries no fallback role and is not a provider credential. That confusion already happened once during the interview.

**Validation:** lint ✅ · typecheck ✅ · unit tests 33/33 ✅ · migration `0002_credentials` applied to the running database ✅
**Commit:** `F02 stage 1 - data model and encryption core` _(SHA recorded in Stage 2's update)_

---

## Stage 2: Provider Validation — ✅ done

- [x] **5. Gemini Validator**
- [x] **6. Azure Speech Validator**
- [x] **7. Validation Dispatch**

**Observations:**
- The shared credential contracts (`packages/shared/src/schemas/credentials.ts`) and the three `CRED*` error codes were created here rather than in Stage 3: `ProviderValidationService` needs the `CredentialProvider` type, so the contracts had to land first. The plan has no explicit step for them.
- **Classification is three-way on purpose, and the boundary is what matters:** "the provider said no" discards the key, "we could not ask" stores it as `unverified` and retries. Collapsing them would either throw away good keys during a provider outage or keep bad ones forever. So Gemini 429 and Azure 5xx are `unverified`, not `invalid` — a throttled key is a working key.
- Every outcome passes through `scrubSecret` before leaving the probe. Not paranoia: the Azure test deliberately simulates a provider echoing the key back in its error body, and asserts the key never reaches the outcome.
- Only the first line of a provider error is kept. Raw SDK errors carry stack frames that would land in the UI verbatim under the PRD's "show the provider's own message" rule.
- **The OpenAPI drift guard fired for real.** Adding the `CRED*` codes changed the `ErrorEnvelope` enum, so the committed snapshot went stale and `openapi.spec.ts` failed. Fixed by regenerating, which is exactly what the directive says to do — this was the guard catching genuine drift rather than the synthetic tamper test it was first verified with.
- Two typecheck failures in my own test code: top-level `await import()` is not allowed under `module: commonjs`, so the Gemini mock uses `vi.hoisted` — `vi.mock` is hoisted above imports and its factory cannot reference a `const` declared later.
- `@google/genai` installed on both the host **and** inside the container. The container has its own `node_modules` volume; F01 lost time to exactly this.

**Validation:** lint ✅ · typecheck ✅ · unit tests 49/49 ✅ · OpenAPI snapshot regenerated ✅
**Commit:** `F02 stage 2 - provider validation` _(SHA recorded in Stage 3's update)_

_Stage 1 commit was `289b839`._

---

## Stage 3: Vault Lifecycle and the Consumption Contract — ✅ done

- [x] **8. Credentials Service**
- [x] **9. Scoped Executor and Audit**
- [x] **10. Credential Endpoints**
- [x] **11. OpenAPI Registration**
- [x] **12. Daily Re-validation Job**

**Observations:**
- Prisma types `Bytes` columns as `Uint8Array`, and Node 24's `Buffer<ArrayBufferLike>` generic does not line up with it. The conversion at the write site is explicit and deliberate — it is not cosmetic.
- `azure_requires_a_region` passes because the **database** check constraint refuses the row, not because the request schema catches it. The API-level schema allows `region` to be absent since Gemini has none, so the constraint is the actual guarantee.
- The executor invalidates a credential only on an authentication failure, never on a timeout or a rate limit. A throttled key is a working key; marking it invalid would block the user out of their own quota.
- Audit writes are wrapped so they can never fail the work they audit. Losing an audit row is bad; failing a lesson analysis because an audit insert timed out would be worse.
- **Test-helper bug, same class as F01's vacuous assertion:** `cryptoBoundTo` used `require()` inside a `try/catch` in an SWC-transformed file. The require failed, the catch swallowed it, `canDecrypt` always returned false — so three tests failed confusingly while `refuses_to_start_when_every_row_fails` **passed for the wrong reason**. Fixed with a static import, and a `the_test_helper_can_actually_decrypt` case now guards the helper itself.
- **Environment gotcha worth carrying forward:** `env_file` is read when a container is *created*, not on restart. Adding `BYOK_MASTER_KEY` to `.env` did nothing until `docker compose up -d --force-recreate api`. The fail-fast guard did its job and named the variable, which is how this was diagnosed in one read. Every future feature that adds an env var will hit this.

**Validation:** lint ✅ · typecheck ✅ · unit 49/49 ✅ · integration: credentials 23/23 ✅, boot probe 6/6 ✅ · OpenAPI regenerated, 9 operations ✅ · API boots with all four credential routes mapped ✅
**Commit:** `F02 stage 3 - vault lifecycle and the consumption contract`

_Stage 2 commit was `0724434`._

---

> _Run was paused here for context budget and resumed in a later session. Stage 4
> below was completed in that second run._

---

## Stage 4: Web Settings Screen — ✅ done

- [x] **13. Settings Route and Provider Cards**
- [x] **14. Save and Delete Flows**
- [x] **15. Live Provider Verification**

**Observations:**
- **The Azure resource is an AI Services resource with a custom subdomain**, not a regional endpoint, so the portal never shows a region and the user could not find one. Recovered it from the `issueToken` JWT: its claims carry `region: eastus2`. Recorded as `TEST_AZURE_SPEECH_REGION` in `.env`. If another resource is ever added, the same trick works — POST `issueToken` to the custom endpoint and read the token's region claim.
- **Live verification found a real UX defect the mocked tests could not.** Both providers wrap their human sentence inside `{ error: { message } }` and hand over the *whole JSON body* as the error text. Shown raw, the settings card would have been a wall of JSON where the PRD asks for the provider's own wording. `humanMessage()` in `validation-outcome.ts` extracts it, and both validators' tests now use the exact envelopes captured from live 400/401 responses.
- **I corrupted the user's `.env` and repaired it.** The file did not end with a newline, so appending `TEST_AZURE_SPEECH_REGION=...` concatenated it onto the end of the Azure key's value. Diagnosed by dumping the raw tail with escapes; repaired by stripping the appended text and re-adding the line properly. **Never append to a file without checking it ends with a newline.**
- The settings page was client-only at first, so the server HTML carried only "Loading…". Switched to server-rendering the list via `credentials-server.ts`, mirroring how the `(app)` layout already resolves the session. The panel keeps its client fetch as a fallback when the server could not provide the list, so the change is strictly additive.
- **`docker compose up -d --force-recreate web` also restarts `api`** (dependency), which kills the API dev server started with `exec -d`, since the container's CMD is `sleep infinity`. Use `docker compose restart <service>` instead — it clears ghost processes without touching dependencies.
- A ghost Next process held port 3000 through repeated `pkill -9 -f node` and `-f next`; the container has no `ps`, so the process count check was meaningless. Only a container restart cleared it. This is the third time this class of problem cost time.
- **Gap caught by the AC re-check, not by the plan:** nothing exercised `DailyRevalidationJob`, yet an acceptance criterion says an unverified key "is retried by the daily job". Four tests added covering promotion, demotion on upstream revocation, re-probing every status, and one failing credential not stopping the sweep.

**Validation:** lint ✅ · typecheck ✅ · unit 50/50 ✅ · integration 58/58 ✅ · web 13/13 ✅ · live providers: Gemini valid/invalid and Azure valid/invalid all correct ✅ · `/settings` server-renders both cards with real data, no key in the HTML ✅
**Commit:** `F02 stage 4 - web settings screen and live verification`

_Stage 3 commit was `db7bb36`._

---

## Final verification

**Status: success.** Every Step 6 check is green.

**Full suite:** lint ✅ · typecheck ✅ · **121 tests** — 50 API unit, 58 API integration, 13 web component.

**Acceptance criteria:** all 7 verified. Beyond the tests, the accepted path was exercised against **real provider credentials**: both keys save as `valid` through the running API, a deliberately wrong Gemini key is rejected with `CRED001` and the clean provider sentence, the rejection leaves the previously stored good key untouched, and no response or rendered page contains key material.

**Component Overview:** all 23 files present.

**Deviations from the spec:**
- `credentials.module.ts` created in Stage 1 rather than Stage 3 — the boot probe resolves the crypto service before feature modules exist.
- Shared credential contracts and `CRED*` codes created in Stage 2 rather than Stage 3 — the validators need the provider type.
- Two files beyond the Component Overview: `credentials-panel.tsx` (client state owner, so the page can stay a server component) and `credentials-server.ts` (server-side list fetch).
- `humanMessage()` was not in the spec; live verification proved it necessary.

**Follow-up work:** none from F02. The storage-adapter test debt inherited from F01 is still open and still scheduled against F07.

**Environment notes worth carrying forward:**
- `env_file` is read when a container is *created*, not on restart — a new variable needs `docker compose up -d --force-recreate <service>`.
- `--force-recreate` on a service restarts its dependencies too, killing dev servers started with `exec -d`. Prefer `docker compose restart`.
- The container's `node_modules` volume is independent from the host's; new dependencies need installing in both.
