import 'dart:io';

import 'package:dio/dio.dart';

/// The named causes the PRD's Experience section requires — screens render
/// one of these, never a generic message.
enum ApiFailureCause { noConnection, serverUnavailable, sessionExpired, other }

/// Maps the API's `{error:{code,message,details}}` envelope, and the
/// transport's own failure modes, onto [ApiFailureCause].
class ApiException implements Exception {
  const ApiException({
    required this.cause,
    required this.message,
    this.code,
    this.details,
  });

  factory ApiException.fromDioException(DioException error) {
    if (_isConnectionFailure(error)) {
      return const ApiException(
        cause: ApiFailureCause.noConnection,
        message: 'No connection',
      );
    }

    final statusCode = error.response?.statusCode;
    final body = error.response?.data;
    final envelope = body is Map ? body['error'] as Map? : null;
    final code = envelope?['code'] as String?;

    if (code == 'AUTH003' || statusCode == 401) {
      return const ApiException(
        cause: ApiFailureCause.sessionExpired,
        message: 'Session expired',
        code: 'AUTH003',
      );
    }

    if (statusCode != null && statusCode >= 500) {
      return const ApiException(
        cause: ApiFailureCause.serverUnavailable,
        message: 'Server unavailable',
      );
    }

    if (envelope != null) {
      return ApiException(
        cause: ApiFailureCause.other,
        message: envelope['message'] as String? ?? 'Something went wrong',
        code: code,
        details: envelope['details'] as Map<String, dynamic>?,
      );
    }

    return const ApiException(
      cause: ApiFailureCause.other,
      message: 'Something went wrong',
    );
  }

  final ApiFailureCause cause;
  final String message;
  final String? code;
  final Map<String, dynamic>? details;

  static bool _isConnectionFailure(DioException error) {
    switch (error.type) {
      case DioExceptionType.connectionError:
      case DioExceptionType.connectionTimeout:
        return true;
      case DioExceptionType.unknown:
        return error.error is SocketException;
      default:
        return false;
    }
  }

  @override
  String toString() => 'ApiException($cause, $message)';
}
