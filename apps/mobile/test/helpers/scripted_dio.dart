import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

typedef Responder = Future<ResponseBody> Function(RequestOptions options);

/// A real [Dio] whose transport answers from a script keyed by
/// `METHOD /path` — the `credentials_test.dart` pattern, shared.
class ScriptedAdapter implements HttpClientAdapter {
  ScriptedAdapter(this.responders);

  final Map<String, Responder> responders;
  final List<RequestOptions> requests = [];

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) {
    requests.add(options);
    final responder = responders['${options.method} ${options.path}'];
    if (responder == null) throw StateError('No script for ${options.method} ${options.path}');
    return responder(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody jsonBody(Object body, {int status = 200}) => ResponseBody.fromString(
  jsonEncode(body),
  status,
  headers: {
    Headers.contentTypeHeader: [Headers.jsonContentType],
  },
);

Responder ok(Object data) => (_) async => jsonBody({'data': data});

Responder failure(int status, String code, String message) =>
    (_) async => jsonBody({
      'error': {'code': code, 'message': message, 'details': null},
    }, status: status);

Responder offline() => (options) async => throw DioException(requestOptions: options, type: DioExceptionType.connectionError);

(Dio, ScriptedAdapter) scriptedDio(Map<String, Responder> responders) {
  final adapter = ScriptedAdapter(responders);
  final dio = Dio(BaseOptions(baseUrl: 'http://api.test'))..httpClientAdapter = adapter;
  return (dio, adapter);
}
