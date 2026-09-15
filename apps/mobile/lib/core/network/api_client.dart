import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../config/app_config.dart';
import 'auth_interceptor.dart';
import 'retry_interceptor.dart';

/// Builds the shared [Dio] client: the base URL tracks [AppConfig.baseUrl]
/// reactively (`ever`, GetX's change-listener — reactivity only, no DI/routing
/// use of the package), so editing it in Settings re-targets every request
/// without an app restart.
class ApiClientFactory {
  static Dio create({required AppConfig config, required AuthInterceptor authInterceptor}) {
    final dio = Dio(BaseOptions(baseUrl: config.baseUrl.value));

    ever<String>(config.baseUrl, (value) => dio.options.baseUrl = value);

    dio.interceptors.add(authInterceptor);
    dio.interceptors.add(RetryInterceptor(dio));

    return dio;
  }
}
