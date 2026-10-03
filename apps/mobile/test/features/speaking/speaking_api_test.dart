import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/speaking/speaking_api.dart';
import 'package:mobile/features/speaking/speaking_models.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';

import '../../helpers/scripted_dio.dart';

class _FakePathProviderPlatform extends PathProviderPlatform {
  @override
  Future<String?> getTemporaryPath() async => Directory.systemTemp.path;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  PathProviderPlatform.instance = _FakePathProviderPlatform();

  const activityId = 'activity-1';

  test('activity_parses_the_data_envelope', () async {
    final (dio, _) = scriptedDio({
      'GET /speaking/activities/$activityId': ok({
        'activityId': activityId,
        'kind': 'speaking',
        'title': 'Talk about your weekend',
        'state': 'pending',
        'planStatus': 'active',
        'estimatedMinutes': 6,
        'targetTags': <Map<String, Object?>>[],
        'task': null,
        'block': null,
        'limits': {'maxAttempts': 3, 'maxRecordingSeconds': 120, 'minRecognizedWords': 10},
        'attemptsUsed': 0,
        'attemptsRemaining': 3,
        'bestAttemptId': null,
        'attempts': <Map<String, Object?>>[],
        'rating': null,
      }),
    });

    final view = await SpeakingApi(dio).activity(activityId);

    expect(view.title, 'Talk about your weekend');
    expect(view.kind, SpeakingActivityKind.speaking);
  });

  test('upload_sends_the_wav_bytes_with_the_client_attempt_header', () async {
    final file = File('${Directory.systemTemp.path}/eq-api-test-${DateTime.now().microsecondsSinceEpoch}.wav');
    await file.writeAsBytes([1, 2, 3, 4]);
    addTearDown(() => file.delete());

    final (dio, adapter) = scriptedDio({
      'POST /speaking/activities/$activityId/attempts': ok({
        'id': 'attempt-1',
        'clientAttemptId': 'client-1',
        'ordinal': null,
        'state': 'scoring',
        'createdAt': '2026-10-02T07:31:12.000Z',
        'scoredAt': null,
        'durationMs': 5000,
        'isBest': false,
        'failure': null,
        'result': null,
      }),
    });

    final view = await SpeakingApi(dio).upload(activityId, 'client-1', file.path);

    expect(view.id, 'attempt-1');
    final request = adapter.requests.single;
    expect(request.headers[speakingClientAttemptIdHeader], 'client-1');
    expect(request.contentType, 'audio/wav');
    expect(request.data, [1, 2, 3, 4]);
  });

  test('rate_sends_the_rating_input_as_the_body', () async {
    final (dio, adapter) = scriptedDio({
      'PUT /speaking/activities/$activityId/rating': ok({'rating': 'too_hard', 'notUseful': false}),
    });

    final view = await SpeakingApi(dio).rate(activityId, const SpeakingRatingInput(rating: null, notUseful: true));

    expect(view.rating, isNotNull);
    expect(adapter.requests.single.data, {'rating': null, 'notUseful': true});
  });

  test('downloadAudio_writes_the_response_bytes_to_a_temp_file', () async {
    final (dio, _) = scriptedDio({
      'GET /speaking/attempts/attempt-1/audio': (_) async => ResponseBody.fromBytes([9, 9, 9], 200),
    });

    final path = await SpeakingApi(dio).downloadAudio('attempt-1');

    expect(await File(path).readAsBytes(), [9, 9, 9]);
    addTearDown(() => File(path).delete());
  });
}
