# Implementation Progress: Mobile Application Shell

**Status:** in progress
**Branch:** main
**Started:** 2026-09-15
**Last updated:** 2026-09-15 (Stage 3 done)

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
**Commit:** `4fd774b` — F03 stage 1 - bearer transport and the mobile token route

## Stage 2: Token Packaging and Flutter Scaffold — ✅ done

- [x] **5. Design tokens as a pub package**
- [x] **6. Dart output relocation**
- [x] **7. Flutter project scaffold**
- [x] **8. Platform configuration**

**Observations:**
- `packages/design-tokens` is now a hybrid npm + pub package: `pubspec.yaml` declares `english_quest_tokens` with a `flutter` SDK dependency (the generated theme imports `package:flutter/material.dart`), `analysis_options.yaml` excludes `node_modules/`, `dist/` and `test/` from the Dart analyzer, `.pubignore` keeps the npm tree out of the pub view.
- `build.ts`'s `buildTokens()` now writes the Dart artifact to `lib/english_quest_tokens.dart` instead of `generated/tokens.dart` — a pub package's library code must live under `lib/`. Ran `pnpm tokens:build` to regenerate; the drift guard in `test/tokens.spec.ts` was pointed at the new path and confirms byte-identical output. `package.json`'s `files` array gained `lib` alongside `dist`/`generated`.
- Scaffolded `apps/mobile` with `flutter create --platforms android,ios --empty` (org `com.englishquest`), then added `flutter_modular`, `get`, `dio`, `flutter_secure_storage`, `shared_preferences`, `connectivity_plus` and `record` via `flutter pub add` (resolved against the installed Flutter 3.44.0 / Dart 3.12.0 SDK rather than hand-picked versions), plus a `path:` dependency on `english_quest_tokens` at `../../packages/design-tokens`. `flutter pub get` resolved the local path package correctly.
- `main.dart` locks portrait orientation via `SystemChrome.setPreferredOrientations` and boots `ModularApp(module: appModule, child: const AppWidget())`. `app_module.dart` is intentionally minimal at this stage — a single placeholder `'/'` route with a spinner — since the real route-less core registrations (config, storage, Dio, session, connectivity, audio) and the auth/shell/settings child modules are Stage 3/4 work; expanding this file is explicitly deferred, not missing. `app_widget.dart` wires `MaterialApp.router` to `ModularApp.routerConfigOf(context)` and themes directly off `eqLightTheme()` from the tokens package as a stopgap — the real light/dark binding (`eq_theme.dart`) is Stage 4's "Theme binding" step.
- Confirmed via Context7 (`/flutterando/modular`) that the current API is `createModule(register:)` + `c.route(path, child:)` + `ModularApp`/`ModularApp.routerConfigOf`, matching what spec.md commits to — no surprises against the doc.
- **Deviation from spec (user-requested mid-stage):** the user asked for stricter mobile lint coverage beyond the `flutter_lints` default — added `depend_on_referenced_packages`, `directives_ordering`, `flutter_style_todos`, `comment_references` and `require_trailing_commas` to `apps/mobile/analysis_options.yaml`. Two rule names had to be corrected by trial against `flutter analyze` (`unnecessary_import`/`unnecessary_imports` are not recognized lint rule names in this SDK; removed). Noted for the user: Dart's linter has no rule that flags "this comment just restates the code" the way some JS linters do — `flutter_style_todos` and `comment_references` are the closest real coverage for comment hygiene, and `require_trailing_commas` is what actually drives `dart format`'s indentation of wrapped multi-line calls/literals. Not in spec.md's Component Overview since it's user-directed lint tightening, not feature behavior.
- Android: `minSdk` set to 26 (API level for Android 8.0) in `build.gradle.kts`; `INTERNET` and `RECORD_AUDIO` permissions declared in the main manifest; `android:usesCleartextTraffic="true"` scoped to the **debug** manifest only (the LAN base URL has no TLS in development; release gets no such exemption).
- iOS: `IPHONEOS_DEPLOYMENT_TARGET` bumped from the scaffold's default 13.0 to 14.0 across all three build configs in `project.pbxproj`; `NSMicrophoneUsageDescription` added to `Info.plist`; both `UISupportedInterfaceOrientations` arrays trimmed to portrait-only (landscape entries removed). `ios/Podfile` did not exist after `flutter create` on Windows (it's normally generated lazily by `pod install`, which needs macOS/CocoaPods) — hand-created it from Flutter's standard template with `platform :ios, '14.0'`. **Per the PRD's split acceptance criterion, none of this iOS configuration is build-verified** — there is no Mac in this environment.
- Real runtime gate: `flutter build apk --debug` succeeded end-to-end (`app-debug.apk` produced), not just `flutter analyze`. No Dart test files exist yet — expected, since spec.md's Testing Strategy only lists mobile test files starting from Stage 3's core session/network work.

**Validation:** `flutter analyze` ✅ (0 issues) · `flutter test` — soft-fail, no test files exist yet (expected at this stage) · design-tokens `pnpm test` ✅ (17/17, including the relocated drift guard) · design-tokens `typecheck` ✅ · repo-wide `pnpm typecheck` ✅ (api/web/shared/design-tokens all clean) · repo-wide `pnpm lint` ✅ (0 warnings) · runtime ✅ `flutter build apk --debug` produced a real APK
**Commit:** `fab2ce3` — F03 stage 2 - token packaging and Flutter scaffold

## Stage 3: Core — Session, Network and Configuration — ✅ done

- [x] **9. Application configuration**
- [x] **10. Secure session store**
- [x] **11. HTTP client and interceptors**
- [x] **12. Error vocabulary**
- [x] **13. Session lifecycle**

**Observations:**
- `app_config.dart`: `AppConfig` wraps `SharedPreferences`, exposes `Rx<String> baseUrl` seeded from `kApiBaseUrlKey` (default `kDefaultApiBaseUrl = 'http://10.0.2.2:3001'`). `setBaseUrl` validates via `isValidBaseUrl` (scheme must be http/https, host non-empty) and throws `InvalidBaseUrlException` on a bad value rather than silently persisting it — spec.md doesn't specify the validation rule itself, so this is a reasonable interpretation of "validates," logged here as a Deviation.
- `session_store.dart`: `SessionStore` wraps `FlutterSecureStorage`, constructor takes an optional instance (`SessionStore([FlutterSecureStorage? storage])`) specifically so tests can substitute a mocktail double instead of touching the real Keystore/Keychain platform channel, which doesn't exist under `flutter test`. Keys: `kSessionTokenKey = 'eq.session.token'`, `kSessionExpiresAtKey = 'eq.session.expiresAt'` — match spec.md's Data Model table exactly.
- `api_exception.dart`: `ApiException.fromDioException` implements the exact mapping table from spec.md §5 — connection failures (`connectionError`, `connectionTimeout`, or `DioExceptionType.unknown` wrapping a `dart:io` `SocketException`, which is how Dio surfaces a raw socket failure) → `noConnection`; `AUTH003`/401 → `sessionExpired`; any other 5xx → `serverUnavailable`; anything else with an `{error}` envelope → the API's own `message`/`details` verbatim.
- `retry_interceptor.dart`: accepts an injectable `delay` function (`DelayFn`, defaulting to `Future.delayed`) so the test suite can assert on the three recorded backoff durations (1s/3s/9s) without waiting 13 real seconds. Mechanism confirmed against Context7 (`/cfug/dio`): on a retryable `onError`, await the delay, call `dio.fetch(retriedOptions)`, `handler.resolve()` whatever it returns; a further failure there re-enters the same `onError` (same `Dio` instance's interceptor chain) with an attempt counter carried in `options.extra`, capped at 3 retries (4 attempts total). Exactly one exception reaches the original caller by construction.
- `auth_interceptor.dart`: depends on `SessionStore` plus a **settable** callback field (`Future<void> Function() onUnauthorized`, default no-op) rather than a constructor-injected `SessionController` — avoids a construction cycle (`SessionController` needs a `Dio` built with this very interceptor). The module graph wires `authInterceptor.onUnauthorized = sessionController.markUnauthenticated` once both exist — that wiring is explicitly Stage 4's job, not done yet.
- `api_client.dart`: `ApiClientFactory.create` builds `Dio`, wires `AuthInterceptor` + `RetryInterceptor`, and binds `dio.options.baseUrl` to `AppConfig.baseUrl` via GetX's `ever()` listener — reactivity only, no `Get.put`/DI/routing use of GetX, matching the spec's boundary.
- `session_controller.dart` / `session_state.dart` / `session_user.dart`: `SessionState` is a Dart 3 `sealed class` (`Restoring`, `Authenticated(SessionUser)`, `Unauthenticated`) exposed as `Rx<SessionState>`, matching spec.md's Data Model table. `restore()` reads the store, calls `GET /auth/me`, and on any `DioException` clears the store and moves to `unauthenticated` — the boot-time confirmation the navigation guard will read in Stage 4. `login()` posts to `/auth/token` and persists via `SessionStore.save`. `logout()` always clears local state even when the server call throws (local truth wins, per spec).
- `connectivity_service.dart`: added to this stage as a reasonable adaptation — spec.md's Component Overview lists it under "core" (line 146) without pinning it to a specific plan step, and it has no navigation/theming dependency, so there's no reason to defer it to Stage 4/5. Wraps `connectivity_plus` (confirmed via Context7 that `checkConnectivity()`/`onConnectivityChanged` return `List<ConnectivityResult>` in the installed v7 line), exposes `RxBool hasLink` — advisory only, never gates a request.
- **Testing setup:** added `mocktail` as a dev dependency (plan.md's Prerequisites already named it). All five spec'd test files written and green: `retry_interceptor_test.dart` (5/5), `auth_interceptor_test.dart` (4/4), `session_controller_test.dart` (4/4), `session_store_test.dart` (2/2), `api_exception_test.dart` (4/4) — 19/19 total, matching every test function named in spec.md §7 for this stage.
- **Testing technique note:** Dio's `HttpClientAdapter` interface (`fetch(RequestOptions, Stream<Uint8List>?, Future<void>?)`, confirmed via Context7) is used directly with a small hand-rolled scripted adapter per test file, per Dio's own documented pattern (`ResponseBody.fromString` is explicitly suggested for test adapters) — no extra HTTP-mocking package needed. One gotcha: `ErrorInterceptorHandler`'s internal completer future isn't publicly accessible outside Dio's own library (`'future' can only be used within instance members of subclasses of '_BaseHandler'`), so `auth_interceptor_test.dart`'s two `onError` tests drive the interceptor through a real `Dio` + scripted-401 adapter and assert on the awaited `dio.get()` call's own exception, rather than touching the handler in isolation.

**Validation:** `flutter analyze` ✅ (0 issues, whole project) · `flutter test` ✅ (19/19 — api_exception 4, auth_interceptor 4, retry_interceptor 5, session_controller 4, session_store 2)
**Commit:** _(pending — recorded after this commit lands)_

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
