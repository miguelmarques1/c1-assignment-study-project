import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

class MicrophonePermissionDeniedException implements Exception {
  const MicrophonePermissionDeniedException();
}

/// `Amplitude.current` is dBFS, roughly -60 (near silence) to 0 (clipping).
/// Clamped and rescaled to the 0-100 range the web's `useAudioLevel` and the
/// waveform widgets both expect, so a reading means the same thing on either
/// client.
const double _minDbfs = -60;

int amplitudeLevel(double dbfs) {
  final clamped = dbfs.clamp(_minDbfs, 0.0);
  return (((clamped - _minDbfs) / -_minDbfs) * 100).round();
}

/// 16 kHz mono 16-bit WAV to a temp path, one file per recording. Permission
/// is requested through `record`'s own `hasPermission()` rather than adding
/// a separate `permission_handler` dependency, per the PRD's chosen package.
class AudioRecorderService {
  AudioRecorderService([AudioRecorder? recorder]) : _recorder = recorder ?? AudioRecorder();

  final AudioRecorder _recorder;

  static const RecordConfig _config = RecordConfig(
    encoder: AudioEncoder.wav,
    sampleRate: 16000,
    numChannels: 1,
  );

  Future<bool> hasPermission() => _recorder.hasPermission();

  Future<void> start() async {
    if (!await _recorder.hasPermission()) {
      throw const MicrophonePermissionDeniedException();
    }

    final directory = await getTemporaryDirectory();
    final path = '${directory.path}/eq-recording-${DateTime.now().microsecondsSinceEpoch}.wav';

    await _recorder.start(_config, path: path);
  }

  Future<String?> stop() => _recorder.stop();

  Future<void> cancel() => _recorder.cancel();

  /// 0-100 level samples, polled every [interval] while recording (F18's waveform).
  Stream<int> amplitudeStream({Duration interval = const Duration(milliseconds: 50)}) {
    return _recorder.onAmplitudeChanged(interval).map((amplitude) => amplitudeLevel(amplitude.current));
  }

  void dispose() => _recorder.dispose();
}
