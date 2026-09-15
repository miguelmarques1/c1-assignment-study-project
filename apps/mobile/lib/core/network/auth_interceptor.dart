import 'package:dio/dio.dart';

import '../session/session_store.dart';

Future<void> _noOp() async {}

/// Attaches the bearer token to every outgoing request and, on a 401, clears
/// the store and signals the session controller.
///
/// `onUnauthorized` is a settable callback rather than a constructor
/// dependency on the controller itself: the controller needs a [Dio] built
/// with this very interceptor, so wiring the callback after both exist (done
/// once, in the module graph) avoids a construction cycle.
class AuthInterceptor extends Interceptor {
  AuthInterceptor(this._store);

  final SessionStore _store;
  Future<void> Function() onUnauthorized = _noOp;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await _store.readToken();
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode == 401) {
      await _store.clear();
      await onUnauthorized();
    }
    handler.next(err);
  }
}
