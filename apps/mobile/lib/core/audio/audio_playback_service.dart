import 'package:just_audio/just_audio.dart';

/// Streaming playback behind an interface, so widget and controller tests
/// fake it (A20). One instance per page: nothing here is a singleton.
abstract class AudioPlayback {
  /// Loads [uri] (sending [headers], e.g. the bearer token) and resolves with
  /// the duration once known. Throws if the media cannot be loaded.
  Future<Duration?> load(Uri uri, {Map<String, String>? headers});

  Future<void> play();
  Future<void> pause();
  Future<void> seek(Duration position);

  Stream<Duration> get positionStream;
  Stream<bool> get playingStream;
  Stream<void> get completedStream;

  Future<void> dispose();
}

class JustAudioPlayback implements AudioPlayback {
  JustAudioPlayback([AudioPlayer? player]) : _player = player ?? AudioPlayer();

  final AudioPlayer _player;

  @override
  Future<Duration?> load(Uri uri, {Map<String, String>? headers}) => _player.setUrl(uri.toString(), headers: headers);

  @override
  Future<void> play() => _player.play();

  @override
  Future<void> pause() => _player.pause();

  @override
  Future<void> seek(Duration position) => _player.seek(position);

  @override
  Stream<Duration> get positionStream => _player.positionStream;

  @override
  Stream<bool> get playingStream => _player.playingStream;

  @override
  Stream<void> get completedStream =>
      _player.processingStateStream.where((state) => state == ProcessingState.completed);

  @override
  Future<void> dispose() => _player.dispose();
}
