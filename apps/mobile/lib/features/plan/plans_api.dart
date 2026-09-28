import 'package:dio/dio.dart';

import '../../core/network/api_exception.dart';
import 'plan_models.dart';

/// Every read the plan screens compose, and the caller's retry of a failed
/// build, through the shared [Dio]. Failures surface as [ApiException].
class PlansApi {
  PlansApi(this._dio);

  final Dio _dio;

  Future<T> _get<T>(String path, T Function(Json json) parse) async {
    try {
      final response = await _dio.get<Json>(path);
      return parse(response.data!['data'] as Json);
    } on DioException catch (error) {
      throw ApiException.fromDioException(error);
    }
  }

  Future<CurrentPlanView> current() => _get('/plans/current', CurrentPlanView.fromJson);

  Future<PlanHistoryView> history() => _get('/plans', PlanHistoryView.fromJson);

  Future<StudyPlanView> plan(String planId) => _get('/plans/$planId', StudyPlanView.fromJson);

  /// The owner's retry of a failed plan build.
  Future<CurrentPlanView> retry() async {
    try {
      final response = await _dio.post<Json>('/plans/retry');
      return CurrentPlanView.fromJson(response.data!['data'] as Json);
    } on DioException catch (error) {
      throw ApiException.fromDioException(error);
    }
  }
}
