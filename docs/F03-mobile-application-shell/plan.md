# Implementation Plan: Mobile Application Shell

**Prerequisites:**
- F01 implemented — the API, its session model and the Docker stack exist
- F02 implemented — the credential endpoints and their masked read model exist and are what the mobile screen consumes
- F21 implemented — `packages/design-tokens` generates the Dart theme this app is themed from
- Flutter 3.44 / Dart 3.12 and the Android SDK, both already present on this machine
- New Flutter dependencies: `flutter_modular`, `get`, `dio`, `flutter_secure_storage`, `shared_preferences`, `connectivity_plus`, `record`; dev: `flutter_lints`, `mocktail`
- A reachable API: the stack running via `docker compose`, with the device or emulator able to route to the host's address
- No Mac is available, so the iOS build cannot be produced or run in this environment

---

### Stage 1: API and Contract Groundwork

**1. Bearer support in the session guard** - Extend the guard so it resolves the session token from the signed cookie first and from an `Authorization: Bearer` header when no cookie is present, leaving every step after extraction untouched. The web path must behave exactly as it does today.

**2. Mobile token route** - Add the public route that authenticates the same way the existing login does but returns the token, its expiry and the user in the response body without setting any cookie. It delegates to the existing authentication service so lockout and timing behaviour are shared rather than reimplemented.

**3. Shared token contract** - Define the token-response schema in the shared package and export it, so the response shape has one definition the API validates against and the client can be checked against.

**4. OpenAPI regeneration** - Register the bearer security scheme alongside the existing cookie scheme, decorate the new route per the project's standing OpenAPI directive, and regenerate the committed document so its drift guard passes.

---

### Stage 2: Token Packaging and Flutter Scaffold

**5. Design tokens as a pub package** - Give `packages/design-tokens` a pub manifest so Flutter can consume it as a path dependency, and scope the Dart analyzer so it does not walk the npm tree that shares the directory.

**6. Dart output relocation** - Move the Dart emitter's output to the package's library directory, since a pub package's source must live there, and update the drift guard to follow it. Regenerating must still produce a byte-identical committed file.

**7. Flutter project scaffold** - Create the application at `apps/mobile` with its manifest, lints and the path dependency on the tokens package, and confirm an empty app analyzes and builds for Android before any feature code exists.

**8. Platform configuration** - Set the Android minimum SDK and the iOS deployment target to the versions the PRD names, declare the microphone and network permissions on both platforms, and lock the app to portrait. The iOS side is configured but cannot be verified here.

---

### Stage 3: Core — Session, Network and Configuration

**9. Application configuration** - Implement the editable API base URL with a default that works on an emulator without editing, persisted in ordinary preferences rather than secure storage, and exposed reactively so a change re-targets the HTTP client without a restart.

**10. Secure session store** - Implement the token and expiry persistence against platform secure storage only, with an explicit clear, so the session survives restart and never appears in ordinary preferences.

**11. HTTP client and interceptors** - Build the client with the interceptor that attaches the session and reacts to a 401 by clearing it, and the interceptor that retries idempotent requests on transport and server failures with the backoff the PRD specifies, emitting a single consolidated failure.

**12. Error vocabulary** - Map the API's error envelope and the transport's failure modes onto the named causes the Experience section requires, so screens render a cause rather than a generic message.

**13. Session lifecycle** - Implement the session state and its transitions — restoring, authenticated, unauthenticated — including the boot-time confirmation that a stored token is still valid server-side, which is what the navigation guard reads.

---

### Stage 4: Navigation and the Design System Mirror

**14. Theme binding** - Bind the application's theme to the generated token package for both brightnesses, with light as the default, so no colour, spacing or type value is written in the mobile app.

**15. Component mirror** - Build the Flutter counterparts of the primitives F21 defines, keeping the variant, size and status vocabulary identical to the web so the two clients cannot drift apart in naming.

**16. Page states** - Build the three page states as components, matching the web's conventions: a skeleton shaped like the incoming content, an empty state naming what is missing and a single action, and an error state naming the cause with a required retry.

**17. Module graph and shell** - Assemble the module graph with the shared core registered app-wide and the feature modules mounted beneath it, and build the bottom navigation across the five destinations with the route guard that redirects on session state. The classroom must be absent from both the route table and the navigation bar.

---

### Stage 5: Screens, Recorder and Verification

**18. Login screen** - Build the login screen with its validation, failure copy and lockout handling, and make the base URL reachable from it so a developer can point the app at the local stack before authenticating.

**19. Settings screen** - Build the settings screen carrying the base URL control and sign-out, which is also where the credentials section mounts.

**20. Credentials screen** - Build the mobile credentials screen mirroring the web: two provider cards with status, masked key, region and last-checked, and the add, replace, delete and re-validate actions. The key field is secure with paste enabled and autocorrect off, and no affordance reveals a stored key.

**21. Audio recorder service** - Implement the permission request and the recorder producing the format the PRD specifies, exposed as a service for the speaking activities to consume later. This feature ships the capability, not a recording screen.

**22. Device verification** - Run the analyzer, the test suite and a real Android build, then exercise the app against the running stack on a device or emulator: log in, confirm the session survives a restart, confirm a 401 returns to login, and confirm the offline state appears with the stack stopped. Record the iOS half of the build criterion as unverified rather than assumed.
