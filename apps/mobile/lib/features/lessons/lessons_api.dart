import 'package:dio/dio.dart';

import '../../core/network/api_exception.dart';
import 'models/analysis_models.dart';
import 'models/json_read.dart';
import 'models/lesson_models.dart';
import 'models/pipeline_models.dart';
import 'models/pronunciation_models.dart';
import 'models/recording_models.dart';
import 'models/scenario_models.dart';
import 'models/transcript_models.dart';

/// Every read the lesson screens compose, and both retries, through the
/// shared [Dio]. Failures surface as [ApiException], so a screen can show
/// the named cause (offline, session expired, `CLASS004`, …).
class LessonsApi {
  LessonsApi(this._dio);

  final Dio _dio;

  Future<T> _get<T>(String path, T Function(Json json) parse, {Map<String, dynamic>? query}) async {
    try {
      final response = await _dio.get<Json>(path, queryParameters: query);
      return parse(response.data!['data'] as Json);
    } on DioException catch (error) {
      throw ApiException.fromDioException(error);
    }
  }

  Future<void> _post(String path) async {
    try {
      await _dio.post<Json>(path);
    } on DioException catch (error) {
      throw ApiException.fromDioException(error);
    }
  }

  Future<LessonList> list({String? cursor}) =>
      _get('/lessons', LessonList.fromJson, query: cursor == null ? null : {'cursor': cursor});

  Future<LessonDetail> detail(String lessonId) => _get('/lessons/$lessonId', LessonDetail.fromJson);

  Future<LessonScenarioView> scenario(String lessonId) =>
      _get('/lessons/$lessonId/scenario', LessonScenarioView.fromJson);

  Future<LessonAnalysisView> analysis(String lessonId) =>
      _get('/lessons/$lessonId/analysis', LessonAnalysisView.fromJson);

  Future<LessonPronunciationView> pronunciation(String lessonId) =>
      _get('/lessons/$lessonId/pronunciation', LessonPronunciationView.fromJson);

  Future<LessonTranscriptView> transcript(String lessonId) =>
      _get('/lessons/$lessonId/transcript', LessonTranscriptView.fromJson);

  Future<LessonPipelineView> pipeline(String lessonId) =>
      _get('/lessons/$lessonId/pipeline', LessonPipelineView.fromJson);

  Future<LessonRecordingView> recording(String lessonId) =>
      _get('/lessons/$lessonId/recording', LessonRecordingView.fromJson);

  /// F08's retry of the caller's own failed stage.
  Future<void> retryPipeline(String lessonId) => _post('/lessons/$lessonId/pipeline/retry');

  /// F07's retry of a failed recording step.
  Future<void> retryRecording(String lessonId) => _post('/lessons/$lessonId/recording/retry');
}
