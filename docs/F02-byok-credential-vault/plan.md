# Implementation Plan: BYOK Credential Vault

**Prerequisites:**
- F01 implemented: running stack, session authentication, Prisma, the shared error envelope and the OpenAPI directive
- New dependencies: `@google/genai`, `@nestjs/schedule`
- Environment variable: `BYOK_MASTER_KEY` — 32 random bytes, base64, generated with `openssl rand -base64 32`
- A real Gemini API key and a real Azure Speech key with its region, for the live verification at the end
- Remember the container has its own `node_modules` volume: new dependencies need `docker compose exec api pnpm install` as well as a host install

---

### Stage 1: Data Model and Encryption Core

**1. Environment Contract** - Add the master key to the validated environment schema with a length check, so a short or absent secret stops the boot with the variable named rather than surfacing later as a decryption failure.

**2. Credential Schema and Migration** - Author the migration creating the vault table and the audit table, with the uniqueness, provider, status and region constraints described in the specification. The region constraint is what stops an Azure credential from ever being stored in an unusable state.

**3. Encryption Service** - Implement authenticated encryption and decryption over the configured master key, with a fresh initialization vector per write and the ciphertext, vector and tag returned separately for storage. Expose the probe the boot check will use.

**4. Boot Decryptability Probe** - Add the startup step that attempts to decrypt every stored credential and decides between the two failure modes in the specification: total failure stops the process, partial failure marks only the affected rows. Wire it into the boot sequence after migrations and before the server listens.

---

### Stage 2: Provider Validation

**5. Gemini Validator** - Probe a key by listing models through the official client under the time budget from the specification, classifying the result as accepted, rejected or unreachable, and preserving the provider's own message for the rejection case without ever echoing the key.

**6. Azure Speech Validator** - Probe a key and region by requesting a short-lived token from the regional endpoint, with the same three-way classification and the same time budget. A wrong region surfaces here rather than being pre-validated against a hard-coded list.

**7. Validation Dispatch** - Route a validation request to the right provider and normalize both outcomes into the single shape the vault stores, so the service layer never branches on which provider it is talking to.

---

### Stage 3: Vault Lifecycle and the Consumption Contract

**8. Credentials Service** - Implement save, read, delete and re-validate, owning every status transition. Saving validates before storing and discards the key entirely when the provider rejects it, leaving any previously stored credential untouched.

**9. Scoped Executor and Audit** - Implement the contract the other seven features consume: resolve and decrypt a credential, block when it is unusable, run the caller's work, and record the outcome. Invalidation on a provider authentication failure happens here, so a revoked key blocks the next attempt instead of burning quota repeatedly.

**10. Credential Endpoints** - Expose listing, saving, deleting and on-demand re-validation. The read model always reports both providers so the interface has no absent-versus-present special case, and no response carries more of the key than its last four characters.

**11. OpenAPI Registration** - Register the credential schemas as components and annotate every new route, then regenerate the committed snapshot. The drift guard from F01 fails the build if this is skipped.

**12. Daily Re-validation Job** - Schedule the recurring job that re-probes every stored credential, covering keys that were unreachable when first saved as well as keys that may have been revoked or re-enabled upstream since.

---

### Stage 4: Web Settings Screen

**13. Settings Route and Provider Cards** - Build the authenticated settings page rendering one card per provider, each showing its status, masked key and last-validated time, with the distinct explanatory copy each provider needs when no key is stored.

**14. Save and Delete Flows** - Implement the form with its masked input and conditional region field, the disabled validating state, and the failure path that keeps the form open and surfaces the provider's own wording. Deleting returns the card to its empty state with the consequence stated.

**15. Live Provider Verification** - Exercise the accepted path once against real credentials from both providers on the running stack, since no test with fabricated keys can prove it. Record the result; the feature is not complete on tests alone.
