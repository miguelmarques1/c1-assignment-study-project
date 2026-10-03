import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/audio/audio_recorder_service.dart';
import 'package:mobile/features/plan/plan_models.dart' show DifficultyRating;
import 'package:mobile/features/speaking/attempt_audio_player.dart';
import 'package:mobile/features/speaking/speaking_api.dart';
import 'package:mobile/features/speaking/speaking_controller.dart';
import 'package:mobile/features/speaking/speaking_models.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/scripted_dio.dart';

class _FakeAudioRecorderService extends Mock implements AudioRecorderService {}

/// `AttemptAudioPlayer`'s real constructor builds a `just_audio.AudioPlayer`,
/// which needs a platform channel that `flutter test` only wires up for
/// `testWidgets` — a plain `test()` has none. Every controller here gets
/// this fake instead, exactly like the recorder.
class _FakeAttemptAudioPlayer extends Mock implements AttemptAudioPlayer {}

const activityId = 'activity-1';

Map<String, Object?> activityJson({String? block, int attemptsRemaining = 3, List<Map<String, Object?>> attempts = const []}) => {
  'activityId': activityId,
  'kind': 'speaking',
  'title': 'Talk about your weekend',
  'state': 'pending',
  'planStatus': 'active',
  'estimatedMinutes': 6,
  'targetTags': <Map<String, Object?>>[],
  'task': null,
  'block': block,
  'limits': {'maxAttempts': 3, 'maxRecordingSeconds': 120, 'minRecognizedWords': 10},
  'attemptsUsed': 3 - attemptsRemaining,
  'attemptsRemaining': attemptsRemaining,
  'bestAttemptId': null,
  'attempts': attempts,
  'rating': null,
};

Map<String, Object?> scoringAttemptJson() => {
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
};

/// `AudioRecorderService.stop()` always returns a real path — a fake one
/// would make `SpeakingApi.upload`'s own `File.readAsBytes` fail before the
/// scripted request is ever sent.
Future<String> _fakeRecordingFile() async {
  final file = File('${Directory.systemTemp.path}/eq-controller-test-${DateTime.now().microsecondsSinceEpoch}.wav');
  await file.writeAsBytes([1, 2, 3, 4]);
  addTearDown(() => file.delete());
  return file.path;
}

void main() {
  setUpAll(() {
    registerFallbackValue(const Duration(milliseconds: 50));
  });

  late _FakeAudioRecorderService recorder;
  late _FakeAttemptAudioPlayer player;

  setUp(() {
    recorder = _FakeAudioRecorderService();
    when(() => recorder.amplitudeStream(interval: any(named: 'interval'))).thenAnswer((_) => const Stream.empty());
    when(() => recorder.dispose()).thenReturn(null);
    player = _FakeAttemptAudioPlayer();
    when(() => player.dispose()).thenAnswer((_) async {});
  });

  test('load_populates_the_activity', () async {
    final (dio, _) = scriptedDio({'GET /speaking/activities/$activityId': ok(activityJson())});
    final controller = SpeakingController(SpeakingApi(dio), activityId, recorder, player);

    await controller.load();

    expect(controller.loaded.value, isTrue);
    expect(controller.activity.value!.title, 'Talk about your weekend');
    controller.onClose();
  });

  test('startRecording_maps_a_denied_permission_to_the_error_gate', () async {
    final (dio, _) = scriptedDio({'GET /speaking/activities/$activityId': ok(activityJson())});
    final controller = SpeakingController(SpeakingApi(dio), activityId, recorder, player);
    when(() => recorder.start()).thenThrow(const MicrophonePermissionDeniedException());

    await controller.startRecording();

    expect(controller.recorderStatus.value, RecorderStatus.error);
    expect(controller.recorderErrorReason.value, RecorderErrorReason.denied);
    controller.onClose();
  });

  test('submit_uploads_the_pending_recording_and_shows_the_result', () async {
    final (dio, _) = scriptedDio({
      'GET /speaking/activities/$activityId': ok(activityJson(attempts: [scoringAttemptJson()..['state'] = 'scored'])),
      'POST /speaking/activities/$activityId/attempts': ok({
        'id': 'attempt-1',
        'clientAttemptId': 'client-1',
        'ordinal': 1,
        'state': 'scored',
        'createdAt': '2026-10-02T07:31:12.000Z',
        'scoredAt': '2026-10-02T07:31:16.000Z',
        'durationMs': 5000,
        'isBest': true,
        'failure': null,
        'result': {
          'scores': {'pronunciation': 80.0, 'accuracy': 80.0, 'fluency': 80.0, 'prosody': null, 'completeness': 100.0},
          'recognizedWordCount': 12,
          'transcript': 'Hello there',
          'words': <Map<String, Object?>>[],
          'failingPhonemes': <Map<String, Object?>>[],
        },
      }),
    });
    when(() => recorder.start()).thenAnswer((_) async {});
    when(() => recorder.stop()).thenAnswer((_) async => await _fakeRecordingFile());

    final controller = SpeakingController(SpeakingApi(dio), activityId, recorder, player);
    await controller.startRecording();
    await controller.stopRecording();
    await controller.submit();

    expect(controller.resultAttemptId.value, 'attempt-1');
    expect(controller.uploadFailure.value, isNull);
    expect(controller.recorderStatus.value, RecorderStatus.idle);
    controller.onClose();
  });

  test('submit_maps_a_cred002_rejection_to_the_credential_failure', () async {
    final (dio, _) = scriptedDio({
      'POST /speaking/activities/$activityId/attempts': failure(409, 'CRED002', 'No usable key for this provider.'),
    });
    when(() => recorder.start()).thenAnswer((_) async {});
    when(() => recorder.stop()).thenAnswer((_) async => await _fakeRecordingFile());

    final controller = SpeakingController(SpeakingApi(dio), activityId, recorder, player);
    await controller.startRecording();
    await controller.stopRecording();
    await controller.submit();

    expect(controller.uploadFailure.value, UploadFailureKind.credential);
    expect(controller.resultAttemptId.value, isNull);
    controller.onClose();
  });

  test('rate_replaces_only_the_rating_on_the_held_activity', () async {
    final (dio, _) = scriptedDio({
      'GET /speaking/activities/$activityId': ok(activityJson()),
      'PUT /speaking/activities/$activityId/rating': ok({'rating': 'just_right', 'notUseful': false}),
    });
    final controller = SpeakingController(SpeakingApi(dio), activityId, recorder, player);
    await controller.load();

    await controller.rate(const SpeakingRatingInput(rating: DifficultyRating.justRight, notUseful: false));

    expect(controller.activity.value!.rating!.rating, DifficultyRating.justRight);
    controller.onClose();
  });
}
