import 'package:dio/dio.dart';

import '../../core/network/api_exception.dart';
import '../lessons/models/json_read.dart';
import 'activity_models.dart';

/// Every call the objective runner makes, through the shared [Dio]. Failures
/// surface as [ApiException].
class ActivitiesApi {
  ActivitiesApi(this._dio);

  final Dio _dio;

  Future<ActivityView> view(String activityId) => _read(() => _dio.get<Json>('/activities/$activityId'));

  /// Idempotent: creates the attempt, or returns the open one (A4).
  Future<ActivityView> start(String activityId) => _read(() => _dio.post<Json>('/activities/$activityId/attempts'));

  /// Idempotent per attempt: a repeat returns the stored result, so a retry after a drop is always safe.
  Future<ActivityView> submit(
    String activityId,
    String attemptId, {
    required String questionsFingerprint,
    required int timeSpentSeconds,
    required List<ObjectiveAnswer> answers,
  }) => _read(
    () => _dio.put<Json>(
      '/activities/$activityId/attempts/$attemptId/submission',
      data: {
        'questionsFingerprint': questionsFingerprint,
        'timeSpentSeconds': timeSpentSeconds,
        'answers': [for (final answer in answers) answer.toJson()],
      },
    ),
  );

  Future<ActivityView> skip(String activityId, String reason) =>
      _read(() => _dio.post<Json>('/activities/$activityId/skip', data: {'reason': reason}));

  Future<void> rate(String activityId, {required String? rating, required bool notUseful}) async {
    try {
      await _dio.put<Json>('/activities/$activityId/rating', data: {'rating': rating, 'notUseful': notUseful});
    } on DioException catch (error) {
      throw ApiException.fromDioException(error);
    }
  }

  /// Where the listening player streams from; the bearer header goes with it.
  Uri mediaUri(String activityId) => Uri.parse('${_dio.options.baseUrl}/activities/$activityId/media');

  Future<ActivityView> _read(Future<Response<Json>> Function() call) async {
    try {
      final response = await call();
      return ActivityView.fromJson(response.data!['data'] as Json);
    } on DioException catch (error) {
      throw ApiException.fromDioException(error);
    }
  }
}
