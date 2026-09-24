# apps/mobile: Flutter client

A Flutter app (Android, with iOS configured but never verified because there is no Mac) for studying between lessons. It does everything the web does except the live lesson: activities, plan, profile, lesson history and results, and BYOK key management. See "Client parity" in the root [AGENTS.md](../../AGENTS.md).

**Any work on a screen or widget follows the mobile UI guide in [.claude/skills/mobile-ui/SKILL.md](../../.claude/skills/mobile-ui/SKILL.md)** (the `mobile-ui` skill in Claude Code). Read it before writing UI code, not after.

## Stack

- Flutter 3.44 and Dart 3.12. The app runs portrait-only (`main.dart` locks the orientation).
- **Routing and DI: `flutter_modular` 7.** Modules are declared with `createModule(path:, register:)`, dependencies are resolved with `inject<T>()`, and route guards return a redirect path or `null`.
- **State: GetX, for reactivity only.** Controllers extend `GetxController` and expose `Rx` values; widgets rebuild with `Obx`. Don't use GetX for routing or DI (`Get.to`, `Get.put`), and don't bring in Riverpod, Provider, Bloc, GoRouter or get_it.
- **Network: `dio`**, built by `ApiClientFactory` with `AuthInterceptor` (the bearer token from the session) and `RetryInterceptor`. Failures become `ApiException`, which maps the API's error codes to messages.
- **Storage:** the session token lives in `flutter_secure_storage` (`SessionStore`), and the API base URL lives in `shared_preferences` (`AppConfig`).

## Layout

- `lib/core/`: config, network, session, connectivity and the audio recorder. These are the building blocks every feature uses.
- `lib/design/`: `EqTheme` (the app's `ThemeData`) and `widgets/Eq*`, which mirror the web's `components/ui` primitives.
- `lib/features/<area>/`: one folder per destination or flow (`auth`, `shell`, `today`, `plan`, `profile`, `lessons`, `settings`), holding the module, pages, controllers and models.
- API models are hand-written Dart classes mirroring the Zod schemas in `packages/shared` (for example `features/settings/credential_models.dart`). When a contract changes there, change the Dart model in the same commit.

## Gotchas

- **Modular binds that call `inject()` must be lazy.** `addSingleton` builds eagerly during `commit()`, before the global `inject()` is wired up. Use `addLazySingleton` for any bind whose factory resolves a sibling.
- **API base URL.** The committed default is `http://10.0.2.2:3001`, which is how the Android emulator reaches the host. On a physical device, set the URL in "Server settings" on the login screen (it persists) or point it at a tunnel. Don't commit a tunnel URL as the default.
- **Formatting.** The codebase is not uniformly `dart format`ted, so don't mass-reformat files you didn't otherwise change. Follow the surrounding style: lines up to about 120 columns, and trailing commas on multi-line calls (`require_trailing_commas` is on).

## Validation

- `flutter analyze` must report 0 issues (`analysis_options.yaml` adds `directives_ordering`, `depend_on_referenced_packages`, `comment_references`, `flutter_style_todos` and `require_trailing_commas` on top of `flutter_lints`).
- `flutter test`: widget tests for pages and unit tests for controllers and core. Use `mocktail` for doubles, and swap `SessionStore` for a mock because platform channels don't exist under `flutter test`. Fake HTTP with a scripted `HttpClientAdapter` on the real `Dio`, as `test/features/login_page_test.dart` does.
- `flutter build apk --debug` is the compile-level runtime check.
- Don't start an emulator or a device run unless the user asks. They review screens on their own device.
