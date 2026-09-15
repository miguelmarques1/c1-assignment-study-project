import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/network/api_exception.dart';

DioException _errorFor(RequestOptions options, {int? statusCode, Object? data}) {
  return DioException(
    requestOptions: options,
    type: DioExceptionType.badResponse,
    response: statusCode == null
        ? null
        : Response(requestOptions: options, statusCode: statusCode, data: data),
  );
}

void main() {
  final options = RequestOptions(path: '/thing');

  group('ApiException.fromDioException', () {
    test('maps_connection_failure_to_no_connection', () {
      final connectionError = DioException(
        requestOptions: options,
        type: DioExceptionType.connectionError,
      );
      final socketFailure = DioException(
        requestOptions: options,
        type: DioExceptionType.unknown,
        error: const SocketException('no route to host'),
      );

      expect(
        ApiException.fromDioException(connectionError).cause,
        ApiFailureCause.noConnection,
      );
      expect(
        ApiException.fromDioException(socketFailure).cause,
        ApiFailureCause.noConnection,
      );
    });

    test('maps_exhausted_5xx_to_server_unavailable', () {
      final error = _errorFor(options, statusCode: 503, data: {
        'error': {'code': 'INTERNAL', 'message': 'boom'},
      });

      final result = ApiException.fromDioException(error);

      expect(result.cause, ApiFailureCause.serverUnavailable);
      expect(result.message, 'Server unavailable');
    });

    test('maps_401_to_session_expired', () {
      final error = _errorFor(options, statusCode: 401, data: {
        'error': {'code': 'AUTH003', 'message': 'Session expired'},
      });

      final result = ApiException.fromDioException(error);

      expect(result.cause, ApiFailureCause.sessionExpired);
    });

    test('preserves_the_api_message_for_other_errors', () {
      final error = _errorFor(options, statusCode: 400, data: {
        'error': {
          'code': 'CREDENTIAL_REJECTED',
          'message': 'The provider rejected the key',
          'details': {'providerMessage': 'Invalid API key'},
        },
      });

      final result = ApiException.fromDioException(error);

      expect(result.cause, ApiFailureCause.other);
      expect(result.code, 'CREDENTIAL_REJECTED');
      expect(result.message, 'The provider rejected the key');
      expect(result.details?['providerMessage'], 'Invalid API key');
    });
  });
}
