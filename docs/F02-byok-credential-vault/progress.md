# Implementation Progress: BYOK Credential Vault

**Status:** in progress
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

## Stage 3: Vault Lifecycle and the Consumption Contract — ⬜ pending

- [ ] **8. Credentials Service**
- [ ] **9. Scoped Executor and Audit**
- [ ] **10. Credential Endpoints**
- [ ] **11. OpenAPI Registration**
- [ ] **12. Daily Re-validation Job**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_

---

## Stage 4: Web Settings Screen — ⬜ pending

- [ ] **13. Settings Route and Provider Cards**
- [ ] **14. Save and Delete Flows**
- [ ] **15. Live Provider Verification**

**Observations:** _(none yet)_

**Validation:** _(not run)_
**Commit:** _(none)_
