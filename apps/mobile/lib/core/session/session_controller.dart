import 'package:dio/dio.dart';
import 'package:get/get.dart';

import 'session_state.dart';
import 'session_store.dart';
import 'session_user.dart';

/// Owns the session state machine — `restoring`, `authenticated`,
/// `unauthenticated` — that Modular's route guard reads through
/// `inject<SessionController>()`.
class SessionController extends GetxController {
  SessionController(this._dio, this._store);

  final Dio _dio;
  final SessionStore _store;

  final Rx<SessionState> state = Rx<SessionState>(const Restoring());

  /// Confirms a stored token is still valid server-side before landing on
  /// the authenticated shell. Called once at boot.
  Future<void> restore() async {
    final token = await _store.readToken();
    if (token == null) {
      state.value = const Unauthenticated();
      return;
    }

    try {
      final response = await _dio.get<Map<String, dynamic>>('/auth/me');
      final user = SessionUser.fromJson(
        response.data!['data'] as Map<String, dynamic>,
      );
      state.value = Authenticated(user);
    } on DioException {
      await _store.clear();
      state.value = const Unauthenticated();
    }
  }

  Future<void> login(String email, String password) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/auth/token',
      data: {'email': email, 'password': password},
    );
    final data = response.data!['data'] as Map<String, dynamic>;

    await _store.save(
      token: data['token'] as String,
      expiresAt: DateTime.parse(data['expiresAt'] as String),
    );
    state.value = Authenticated(SessionUser.fromJson(data['user'] as Map<String, dynamic>));
  }

  Future<void> logout() async {
    try {
      await _dio.post<void>('/auth/logout');
    } on DioException {
      // Local truth wins: the token is discarded regardless of whether the
      // server-side revocation call succeeded.
    }
    await _store.clear();
    state.value = const Unauthenticated();
  }

  /// Bound to the auth interceptor's `onUnauthorized` callback once both
  /// exist — a 401 anywhere in the app moves the whole session to
  /// `unauthenticated`.
  Future<void> markUnauthenticated() async {
    state.value = const Unauthenticated();
  }
}
