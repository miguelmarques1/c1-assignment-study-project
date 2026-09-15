import 'package:dio/dio.dart';

typedef DelayFn = Future<void> Function(Duration duration);

Future<void> _defaultDelay(Duration duration) => Future.delayed(duration);

const List<Duration> kRetryBackoffs = [
  Duration(seconds: 1),
  Duration(seconds: 3),
  Duration(seconds: 9),
];

const Set<String> _idempotentMethods = {'GET', 'PUT', 'DELETE', 'HEAD'};

const String _attemptKey = 'eq.retryAttempt';

/// Retries idempotent requests on 5xx and transport failure, 1s/3s/9s, and
/// surfaces exactly one failure to the caller regardless of how many
/// attempts it took.
class RetryInterceptor extends Interceptor {
  RetryInterceptor(this._dio, {this._delay = _defaultDelay});

  final Dio _dio;
  final DelayFn _delay;

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final options = err.requestOptions;
    final attempt = (options.extra[_attemptKey] as int?) ?? 0;

    final isIdempotent = _idempotentMethods.contains(options.method.toUpperCase());
    final canRetry = attempt < kRetryBackoffs.length && isIdempotent && _isRetryable(err);

    if (!canRetry) {
      handler.next(err);
      return;
    }

    await _delay(kRetryBackoffs[attempt]);

    final retryOptions = options.copyWith(
      extra: {...options.extra, _attemptKey: attempt + 1},
    );

    try {
      final response = await _dio.fetch(retryOptions);
      handler.resolve(response);
    } on DioException catch (retryError) {
      handler.next(retryError);
    }
  }

  bool _isRetryable(DioException err) {
    switch (err.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.connectionError:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
        return true;
      case DioExceptionType.badResponse:
        final status = err.response?.statusCode ?? 0;
        return status >= 500 && status < 600;
      default:
        return false;
    }
  }
}
