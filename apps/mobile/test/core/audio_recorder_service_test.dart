import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/audio/audio_recorder_service.dart';
import 'package:mocktail/mocktail.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:record/record.dart';

class _FakeAudioRecorder extends Mock implements AudioRecorder {}

/// `getTemporaryDirectory()` has no platform channel under `flutter test`.
class _FakePathProviderPlatform extends PathProviderPlatform {
  @override
  Future<String?> getTemporaryPath() async => '/tmp';
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    registerFallbackValue(const RecordConfig());
    registerFallbackValue(Duration.zero);
    PathProviderPlatform.instance = _FakePathProviderPlatform();
  });

  late _FakeAudioRecorder recorder;
  late AudioRecorderService service;

  setUp(() {
    recorder = _FakeAudioRecorder();
    service = AudioRecorderService(recorder);
  });

  group('amplitudeLevel', () {
    test('clamps_silence_and_clipping_to_the_0_100_range', () {
      expect(amplitudeLevel(-60), 0);
      expect(amplitudeLevel(-120), 0);
      expect(amplitudeLevel(0), 100);
      expect(amplitudeLevel(10), 100);
    });

    test('scales_the_midpoint_linearly', () {
      expect(amplitudeLevel(-30), 50);
    });
  });

  group('AudioRecorderService', () {
    test('start_throws_when_permission_is_denied', () async {
      when(() => recorder.hasPermission()).thenAnswer((_) async => false);

      await expectLater(service.start(), throwsA(isA<MicrophonePermissionDeniedException>()));
      verifyNever(() => recorder.start(any(), path: any(named: 'path')));
    });

    test('start_records_wav_once_permission_is_granted', () async {
      when(() => recorder.hasPermission()).thenAnswer((_) async => true);
      when(() => recorder.start(any(), path: any(named: 'path'))).thenAnswer((_) async {});

      await service.start();

      final config = verify(() => recorder.start(captureAny(), path: captureAny(named: 'path'))).captured;
      expect((config[0] as RecordConfig).encoder, AudioEncoder.wav);
      expect(config[1] as String, endsWith('.wav'));
    });

    test('amplitude_stream_maps_dbfs_readings_to_0_100', () {
      when(() => recorder.onAmplitudeChanged(any())).thenAnswer(
        (_) => Stream.value(Amplitude(current: -30, max: -10)),
      );

      expect(service.amplitudeStream(), emits(50));
    });
  });
}
