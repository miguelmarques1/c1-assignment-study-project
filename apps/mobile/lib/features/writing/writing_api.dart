import 'package:dio/dio.dart';

import '../../core/network/api_exception.dart';
import 'writing_models.dart';

/// `open`, `get`, `saveDraft` and `submit` on the shared [Dio]. `saveDraft`
/// is a `PUT`, which `RetryInterceptor` may retry safely thanks to A5's
/// idempotent case (the identical text at a stale revision still succeeds).
/// Errors become [ApiException]s carrying `code` and `details`.
class WritingApi {
  WritingApi(this._dio);

  final Dio _dio;

  Future<WritingActivityView> open(String activityId) async {
    try {
      final response = await _dio.post<Json>('/activities/$activityId/writing/open');
      return WritingActivityView.fromJson(response.data!['data'] as Json);
    } on DioException catch (error) {
      throw ApiException.fromDioException(error);
    }
  }

  Future<WritingActivityView> read(String activityId) async {
    try {
      final response = await _dio.get<Json>('/activities/$activityId/writing');
      return WritingActivityView.fromJson(response.data!['data'] as Json);
    } on DioException catch (error) {
      throw ApiException.fromDioException(error);
    }
  }

  Future<WritingDraftSaved> saveDraft(
    String activityId, {
    required String text,
    required int baseRevision,
    required int activeSecondsDelta,
  }) async {
    try {
      final response = await _dio.put<Json>(
        '/activities/$activityId/writing/draft',
        data: {'text': text, 'baseRevision': baseRevision, 'activeSecondsDelta': activeSecondsDelta},
      );
      return WritingDraftSaved.fromJson(response.data!['data'] as Json);
    } on DioException catch (error) {
      throw ApiException.fromDioException(error);
    }
  }

  Future<WritingActivityView> submit(String activityId, {required String submissionId, required int baseRevision}) async {
    try {
      final response = await _dio.post<Json>(
        '/activities/$activityId/writing/submit',
        data: {'submissionId': submissionId, 'baseRevision': baseRevision},
      );
      return WritingActivityView.fromJson(response.data!['data'] as Json);
    } on DioException catch (error) {
      throw ApiException.fromDioException(error);
    }
  }
}
