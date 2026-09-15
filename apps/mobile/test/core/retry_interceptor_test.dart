import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/network/retry_interceptor.dart';

class _ScriptedAdapter implements HttpClientAdapter {
  _ScriptedAdapter(this.responses);

  final List<Object> responses;
  int calls = 0;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final next = responses[calls];
    calls++;

    if (next is int) {
      throw DioException(
        requestOptions: options,
        type: DioExceptionType.badResponse,
        response: Response(requestOptions: options, statusCode: next),
      );
    }

    return ResponseBody.fromString('{}', 200, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}

Dio _dioWithScript(List<Object> responses, {required List<Duration> recordedDelays}) {
  final dio = Dio(BaseOptions(baseUrl: 'http://test'));
  dio.httpClientAdapter = _ScriptedAdapter(responses);
  dio.interceptors.add(
    RetryInterceptor(
      dio,
      delay: (duration) async {
        recordedDelays.add(duration);
      },
    ),
  );
  return dio;
}

void main() {
  group('RetryInterceptor', () {
    test('retries_idempotent_requests_three_times_with_expected_backoff', () async {
      final delays = <Duration>[];
      final dio = _dioWithScript([503, 503, 503, 503], recordedDelays: delays);

      await expectLater(dio.get<void>('/thing'), throwsA(isA<DioException>()));

      expect((dio.httpClientAdapter as _ScriptedAdapter).calls, 4);
      expect(delays, [
        const Duration(seconds: 1),
        const Duration(seconds: 3),
        const Duration(seconds: 9),
      ]);
    });

    test('does_not_retry_non_idempotent_requests', () async {
      final delays = <Duration>[];
      final dio = _dioWithScript([503, 503, 503, 503], recordedDelays: delays);

      await expectLater(dio.post<void>('/thing'), throwsA(isA<DioException>()));

      expect((dio.httpClientAdapter as _ScriptedAdapter).calls, 1);
      expect(delays, isEmpty);
    });

    test('does_not_retry_client_errors', () async {
      final delays = <Duration>[];
      final dio400 = _dioWithScript([400], recordedDelays: delays);
      final dio401 = _dioWithScript([401], recordedDelays: delays);

      await expectLater(dio400.get<void>('/thing'), throwsA(isA<DioException>()));
      await expectLater(dio401.get<void>('/thing'), throwsA(isA<DioException>()));

      expect((dio400.httpClientAdapter as _ScriptedAdapter).calls, 1);
      expect((dio401.httpClientAdapter as _ScriptedAdapter).calls, 1);
    });

    test('surfaces_a_single_consolidated_failure', () async {
      final delays = <Duration>[];
      final dio = _dioWithScript([503, 503, 503, 503], recordedDelays: delays);

      var exceptionCount = 0;
      try {
        await dio.get<void>('/thing');
      } on DioException {
        exceptionCount++;
      }

      expect(exceptionCount, 1);
    });

    test('stops_retrying_once_a_retry_succeeds', () async {
      final delays = <Duration>[];
      final dio = _dioWithScript([503, 503, 'ok'], recordedDelays: delays);

      final response = await dio.get<void>('/thing');

      expect(response.statusCode, 200);
      expect((dio.httpClientAdapter as _ScriptedAdapter).calls, 3);
    });
  });
}
