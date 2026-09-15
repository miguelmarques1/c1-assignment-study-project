import 'package:dio/dio.dart';
import 'package:flutter_modular/flutter_modular.dart';

import 'boot_gate.dart';
import 'core/audio/audio_recorder_service.dart';
import 'core/config/app_config.dart';
import 'core/connectivity/connectivity_service.dart';
import 'core/network/api_client.dart';
import 'core/network/auth_interceptor.dart';
import 'core/session/session_controller.dart';
import 'core/session/session_store.dart';
import 'features/auth/auth_module.dart';
import 'features/shell/shell_module.dart';

/// The app's coupling map: which modules exist and how they connect.
///
/// `AppConfig` needs `SharedPreferences`, which is async — resolved once
/// here, before the module is built, so every registration below stays a
/// synchronous factory. `main()` awaits this exactly once.
Future<Module> buildAppModule() async {
  final config = await AppConfig.create();

  return createModule(
    register: (c) {
      c
        ..addInstance<AppConfig>(config)
        ..addSingleton<SessionStore>(SessionStore.new)
        ..addSingleton<AuthInterceptor>(() => AuthInterceptor(inject<SessionStore>()))
        ..addSingleton<Dio>(
          () => ApiClientFactory.create(
            config: inject<AppConfig>(),
            authInterceptor: inject<AuthInterceptor>(),
          ),
        )
        ..addSingleton<SessionController>(() {
          final controller = SessionController(inject<Dio>(), inject<SessionStore>());
          inject<AuthInterceptor>().onUnauthorized = controller.markUnauthenticated;
          return controller;
        })
        ..addSingleton<ConnectivityService>(ConnectivityService.new)
        ..addSingleton<AudioRecorderService>(AudioRecorderService.new)
        ..route('/', child: (ctx, state) => const BootGate())
        ..module(authModule)
        ..module(shellModule);
    },
  );
}
