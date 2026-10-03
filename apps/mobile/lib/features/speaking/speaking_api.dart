import 'dart:io';

import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';

import '../../core/network/api_exception.dart';
import '../lessons/models/json_read.dart';
import 'speaking_models.dart';

/// Every read and write the speaking runner makes, through the shared
/// [Dio]. Failures surface as [ApiException].
class SpeakingApi {
  SpeakingApi(this._dio);

  final Dio _dio;

  Future<SpeakingActivityView> activity(String activityId) async {
    try {
      final response = await _dio.get<Json>('/speaking/activities/$activityId');
      return SpeakingActivityView.fromJson(response.data!['data'] as Json);
    } on DioException catch (error) {
      throw ApiException.fromDioException(error);
    }
  }

  /// `clientAttemptId` is the idempotency key (A21): resending it for a lost
  /// response returns the one stored attempt rather than scoring twice.
  Future<SpeakingAttemptView> upload(String activityId, String clientAttemptId, String filePath) async {
    try {
      final bytes = await File(filePath).readAsBytes();
      final response = await _dio.post<Json>(
        '/speaking/activities/$activityId/attempts',
        data: bytes,
        options: Options(
          contentType: 'audio/wav',
          headers: {speakingClientAttemptIdHeader: clientAttemptId},
        ),
      );
      return SpeakingAttemptView.fromJson(response.data!['data'] as Json);
    } on DioException catch (error) {
      throw ApiException.fromDioException(error);
    }
  }

  Future<SpeakingAttemptView> rescore(String attemptId) async {
    try {
      final response = await _dio.post<Json>('/speaking/attempts/$attemptId/rescore');
      return SpeakingAttemptView.fromJson(response.data!['data'] as Json);
    } on DioException catch (error) {
      throw ApiException.fromDioException(error);
    }
  }

  Future<SpeakingRatingView> rate(String activityId, SpeakingRatingInput input) async {
    try {
      final response = await _dio.put<Json>('/speaking/activities/$activityId/rating', data: input.toJson());
      return SpeakingRatingView.fromJson(response.data!['data'] as Json);
    } on DioException catch (error) {
      throw ApiException.fromDioException(error);
    }
  }

  /// Downloads an attempt's WAV to a temp file, for `AttemptAudioPlayer` to play.
  Future<String> downloadAudio(String attemptId) async {
    try {
      final response = await _dio.get<List<int>>(
        '/speaking/attempts/$attemptId/audio',
        options: Options(responseType: ResponseType.bytes),
      );
      final directory = await getTemporaryDirectory();
      final path = '${directory.path}/eq-attempt-$attemptId.wav';
      await File(path).writeAsBytes(response.data!);
      return path;
    } on DioException catch (error) {
      throw ApiException.fromDioException(error);
    }
  }
}
