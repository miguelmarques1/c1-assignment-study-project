import 'package:flutter_test/flutter_test.dart';
import 'package:just_audio/just_audio.dart';
import 'package:mobile/features/speaking/attempt_audio_player.dart';
import 'package:mocktail/mocktail.dart';

class _FakeAudioPlayer extends Mock implements AudioPlayer {}

void main() {
  setUpAll(() {
    registerFallbackValue(ConcatenatingAudioSource(children: const []));
  });

  late _FakeAudioPlayer player;
  late AttemptAudioPlayer attemptPlayer;

  setUp(() {
    player = _FakeAudioPlayer();
    attemptPlayer = AttemptAudioPlayer(player);
    when(() => player.setFilePath(any())).thenAnswer((_) async => null);
    when(() => player.setAudioSource(any())).thenAnswer((_) async => null);
    when(() => player.play()).thenAnswer((_) async {});
    when(() => player.stop()).thenAnswer((_) async {});
    when(() => player.dispose()).thenAnswer((_) async {});
  });

  test('playFile_sets_the_path_and_plays', () async {
    await attemptPlayer.playFile('/tmp/attempt.wav');

    verify(() => player.setFilePath('/tmp/attempt.wav')).called(1);
    verify(() => player.play()).called(1);
  });

  test('playRange_pads_the_segment_by_100ms_on_both_sides', () async {
    await attemptPlayer.playRange('/tmp/attempt.wav', const Duration(milliseconds: 500), const Duration(milliseconds: 300));

    final captured = verify(() => player.setAudioSource(captureAny())).captured;
    final source = captured.single as ClippingAudioSource;
    expect(source.start, const Duration(milliseconds: 400));
    expect(source.end, const Duration(milliseconds: 900));
    verify(() => player.play()).called(1);
  });

  test('playRange_clamps_a_start_near_zero_to_zero', () async {
    await attemptPlayer.playRange('/tmp/attempt.wav', const Duration(milliseconds: 50), const Duration(milliseconds: 200));

    final captured = verify(() => player.setAudioSource(captureAny())).captured;
    final source = captured.single as ClippingAudioSource;
    expect(source.start, Duration.zero);
  });

  test('stop_delegates_to_the_underlying_player', () async {
    await attemptPlayer.stop();

    verify(() => player.stop()).called(1);
  });
}
