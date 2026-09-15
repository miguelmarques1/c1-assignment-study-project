import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/session/session_controller.dart';
import 'package:mobile/core/session/session_state.dart';
import 'package:mobile/core/session/session_store.dart';
import 'package:mocktail/mocktail.dart';

class _MockSessionStore extends Mock implements SessionStore {}

typedef _Responder = Future<ResponseBody> Function(RequestOptions options);

class _ScriptedAdapter implements HttpClientAdapter {
  _ScriptedAdapter(this.responders);

  final Map<String, _Responder> responders;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) {
    final responder = responders[options.path];
    if (responder == null) {
      throw StateError('No script for ${options.path}');
    }
    return responder(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(Map<String, dynamic> body, int statusCode) {
  return ResponseBody.fromString(
    jsonEncode(body),
    statusCode,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    },
  );
}

void main() {
  late _MockSessionStore store;

  setUp(() {
    store = _MockSessionStore();
  });

  group('SessionController', () {
    test('restores_a_valid_session_on_boot', () async {
      when(() => store.readToken()).thenAnswer((_) async => 'token-123');
      final dio = Dio(BaseOptions(baseUrl: 'http://test'))
        ..httpClientAdapter = _ScriptedAdapter({
          '/auth/me': (options) async => _json({
                'data': {
                  'id': 'u1',
                  'email': 'learner@example.com',
                  'displayName': 'Learner',
                },
              }, 200),
        });
      final controller = SessionController(dio, store);

      await controller.restore();

      expect(controller.state.value, isA<Authenticated>());
      expect((controller.state.value as Authenticated).user.email, 'learner@example.com');
    });

    test('discards_a_token_the_server_rejects', () async {
      when(() => store.readToken()).thenAnswer((_) async => 'stale-token');
      when(() => store.clear()).thenAnswer((_) async {});
      final dio = Dio(BaseOptions(baseUrl: 'http://test'))
        ..httpClientAdapter = _ScriptedAdapter({
          '/auth/me': (options) async => throw DioException(
                requestOptions: options,
                type: DioExceptionType.badResponse,
                response: Response(requestOptions: options, statusCode: 401),
              ),
        });
      final controller = SessionController(dio, store);

      await controller.restore();

      verify(() => store.clear()).called(1);
      expect(controller.state.value, isA<Unauthenticated>());
    });

    test('login_persists_the_token_and_expiry', () async {
      when(() => store.save(token: any(named: 'token'), expiresAt: any(named: 'expiresAt')))
          .thenAnswer((_) async {});
      final dio = Dio(BaseOptions(baseUrl: 'http://test'))
        ..httpClientAdapter = _ScriptedAdapter({
          '/auth/token': (options) async => _json({
                'data': {
                  'token': 'new-token',
                  'expiresAt': '2026-09-22T03:14:07.000Z',
                  'user': {
                    'id': 'u1',
                    'email': 'learner@example.com',
                    'displayName': 'Learner',
                  },
                },
              }, 200),
        });
      final controller = SessionController(dio, store);

      await controller.login('learner@example.com', 'a good password');

      final captured = verify(
        () => store.save(token: captureAny(named: 'token'), expiresAt: captureAny(named: 'expiresAt')),
      ).captured;
      expect(captured[0], 'new-token');
      expect(captured[1], DateTime.parse('2026-09-22T03:14:07.000Z'));
      expect(controller.state.value, isA<Authenticated>());
    });

    test('logout_clears_the_store_even_when_the_request_fails', () async {
      when(() => store.clear()).thenAnswer((_) async {});
      final dio = Dio(BaseOptions(baseUrl: 'http://test'))
        ..httpClientAdapter = _ScriptedAdapter({
          '/auth/logout': (options) async => throw DioException(
                requestOptions: options,
                type: DioExceptionType.connectionError,
              ),
        });
      final controller = SessionController(dio, store);

      await controller.logout();

      verify(() => store.clear()).called(1);
      expect(controller.state.value, isA<Unauthenticated>());
    });
  });
}
