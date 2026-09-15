import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/network/auth_interceptor.dart';
import 'package:mobile/core/session/session_store.dart';
import 'package:mocktail/mocktail.dart';

class _MockSessionStore extends Mock implements SessionStore {}

class _Always401Adapter implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    throw DioException(
      requestOptions: options,
      type: DioExceptionType.badResponse,
      response: Response(requestOptions: options, statusCode: 401),
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late _MockSessionStore store;
  late AuthInterceptor interceptor;

  setUp(() {
    store = _MockSessionStore();
    interceptor = AuthInterceptor(store);
  });

  group('AuthInterceptor', () {
    test('attaches_the_bearer_token_when_a_session_exists', () async {
      when(() => store.readToken()).thenAnswer((_) async => 'token-123');
      final options = RequestOptions(path: '/thing');

      await interceptor.onRequest(options, RequestInterceptorHandler());

      expect(options.headers['Authorization'], 'Bearer token-123');
    });

    test('sends_no_authorization_header_when_signed_out', () async {
      when(() => store.readToken()).thenAnswer((_) async => null);
      final options = RequestOptions(path: '/thing');

      await interceptor.onRequest(options, RequestInterceptorHandler());

      expect(options.headers.containsKey('Authorization'), isFalse);
    });

    test('a_401_clears_the_stored_session', () async {
      when(() => store.readToken()).thenAnswer((_) async => 'token-123');
      when(() => store.clear()).thenAnswer((_) async {});
      final dio = Dio(BaseOptions(baseUrl: 'http://test'))
        ..httpClientAdapter = _Always401Adapter()
        ..interceptors.add(interceptor);

      await expectLater(dio.get<void>('/thing'), throwsA(isA<DioException>()));

      verify(() => store.clear()).called(1);
    });

    test('a_401_moves_the_session_state_to_unauthenticated', () async {
      when(() => store.readToken()).thenAnswer((_) async => 'token-123');
      when(() => store.clear()).thenAnswer((_) async {});
      var signaled = false;
      interceptor.onUnauthorized = () async {
        signaled = true;
      };
      final dio = Dio(BaseOptions(baseUrl: 'http://test'))
        ..httpClientAdapter = _Always401Adapter()
        ..interceptors.add(interceptor);

      await expectLater(dio.get<void>('/thing'), throwsA(isA<DioException>()));

      expect(signaled, isTrue);
    });
  });
}
