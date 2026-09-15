import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

class MicrophonePermissionDeniedException implements Exception {
  const MicrophonePermissionDeniedException();
}

/// 16 kHz mono 16-bit WAV to a temp path, one file per recording. Permission
/// is requested through `record`'s own `hasPermission()` rather than adding
/// a separate `permission_handler` dependency, per the PRD's chosen package.
/// Ships the capability for the speaking activities to consume later — this
/// feature does not include a recording screen.
class AudioRecorderService {
  AudioRecorderService([AudioRecorder? recorder]) : _recorder = recorder ?? AudioRecorder();

  final AudioRecorder _recorder;

  static const RecordConfig _config = RecordConfig(
    encoder: AudioEncoder.pcm16bits,
    sampleRate: 16000,
    numChannels: 1,
  );

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

  void dispose() => _recorder.dispose();
}
