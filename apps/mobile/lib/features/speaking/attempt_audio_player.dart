import 'package:just_audio/just_audio.dart';

/// Plays a recording in full, or one word's segment with 100 ms padding
/// either side (A27) — the same padding the web's `useAttemptAudio` adds.
class AttemptAudioPlayer {
  AttemptAudioPlayer([AudioPlayer? player]) : _player = player ?? AudioPlayer();

  final AudioPlayer _player;

  static const Duration _rangePadding = Duration(milliseconds: 100);

  Stream<PlayerState> get playerStateStream => _player.playerStateStream;

  Future<void> playFile(String path) async {
    await _player.setFilePath(path);
    await _player.play();
  }

  Future<void> playRange(String path, Duration start, Duration duration) async {
    final paddedStart = start - _rangePadding;
    final clippedStart = paddedStart.isNegative ? Duration.zero : paddedStart;
    final paddedEnd = start + duration + _rangePadding;

    await _player.setAudioSource(
      ClippingAudioSource(
        child: AudioSource.uri(Uri.file(path)),
        start: clippedStart,
        end: paddedEnd,
      ),
    );
    await _player.play();
  }

  Future<void> stop() => _player.stop();

  Future<void> dispose() => _player.dispose();
}
