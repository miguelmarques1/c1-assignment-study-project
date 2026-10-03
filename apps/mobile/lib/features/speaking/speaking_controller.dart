import 'dart:async';
import 'dart:math';

import 'package:get/get.dart';

import '../../core/audio/audio_recorder_service.dart';
import '../../core/network/api_exception.dart';
import 'attempt_audio_player.dart';
import 'speaking_api.dart';
import 'speaking_models.dart';

/// A UUID v4 built from `Random.secure()` (A21) — no `uuid` package needed for one id.
String randomClientAttemptId() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

enum RecorderStatus { idle, requesting, recording, stopped, error }

/// Mobile has no DOM-level `NotFoundError`/`NotAllowedError` to distinguish —
/// `record`'s platform exceptions aren't typed by cause — so every failure
/// besides a denied permission collapses to `other` (deviation from the
/// web's three-way split, logged in F18's progress notes).
enum RecorderErrorReason { denied, other }

enum UploadFailureKind { network, credential }

/// Mirrors the web runner's state machine: `ready` → `recording` → `review`
/// → `submitting` → `result`, plus the blocked/error gates — derived from
/// the recorder's own status plus two local flags, the same way the web
/// hook does, so the two never disagree about which screen is up.
class SpeakingController extends GetxController {
  SpeakingController(this._api, this.activityId, [AudioRecorderService? recorder, AttemptAudioPlayer? player])
    : _recorder = recorder ?? AudioRecorderService(),
      _player = player ?? AttemptAudioPlayer();

  final SpeakingApi _api;
  final String activityId;
  final AudioRecorderService _recorder;
  final AttemptAudioPlayer _player;

  /// A stored attempt's audio is fetched once and replayed from disk after that.
  final Map<String, String> _audioPaths = {};

  /// Null while nothing from a stored attempt is playing (a local, not-yet-uploaded recording has no attempt id).
  final playingAttemptId = Rxn<String>();
  final playingLocal = false.obs;

  final activity = Rxn<SpeakingActivityView>();
  final loaded = false.obs;
  final error = Rxn<ApiException>();

  final recorderStatus = RecorderStatus.idle.obs;
  final recorderErrorReason = Rxn<RecorderErrorReason>();
  final elapsedMs = 0.obs;
  final level = Rxn<int>();
  final hitLimit = false.obs;

  final submitting = false.obs;
  final uploadFailure = Rxn<UploadFailureKind>();
  final resultAttemptId = Rxn<String>();
  final rescoringId = Rxn<String>();

  /// The pending recording's own path and client id (A21) — kept until a successful upload.
  String? _pendingPath;
  String? _pendingClientId;

  StreamSubscription<int>? _amplitudeSub;
  Timer? _limitTimer;
  Timer? _tickTimer;
  Timer? _pollTimer;
  DateTime? _startedAt;

  bool get hasUnsentRecording => recorderStatus.value == RecorderStatus.stopped || uploadFailure.value != null;

  Future<void> load() async {
    error.value = null;
    try {
      activity.value = await _api.activity(activityId);
      loaded.value = true;
      _syncPolling();
    } on ApiException catch (failure) {
      error.value = failure;
    }
  }

  void _syncPolling() {
    final isScoring = activity.value?.attempts.any((attempt) => attempt.state == SpeakingAttemptState.scoring) ?? false;
    if (isScoring) {
      _pollTimer ??= Timer.periodic(const Duration(seconds: 2), (_) => load());
    } else {
      _pollTimer?.cancel();
      _pollTimer = null;
    }
  }

  Future<void> startRecording() async {
    uploadFailure.value = null;
    resultAttemptId.value = null;
    hitLimit.value = false;
    elapsedMs.value = 0;
    recorderStatus.value = RecorderStatus.requesting;

    try {
      await _recorder.start();
    } on MicrophonePermissionDeniedException {
      recorderStatus.value = RecorderStatus.error;
      recorderErrorReason.value = RecorderErrorReason.denied;
      return;
    } catch (_) {
      recorderStatus.value = RecorderStatus.error;
      recorderErrorReason.value = RecorderErrorReason.other;
      return;
    }

    recorderStatus.value = RecorderStatus.recording;
    _startedAt = DateTime.now();
    _amplitudeSub = _recorder.amplitudeStream().listen((value) => level.value = value);
    _tickTimer = Timer.periodic(const Duration(milliseconds: 200), (_) {
      final startedAt = _startedAt;
      if (startedAt != null) elapsedMs.value = DateTime.now().difference(startedAt).inMilliseconds;
    });

    final maxSeconds = activity.value?.limits.maxRecordingSeconds ?? 120;
    _limitTimer = Timer(Duration(seconds: maxSeconds), () {
      hitLimit.value = true;
      stopRecording();
    });
  }

  Future<void> stopRecording() async {
    _tickTimer?.cancel();
    _limitTimer?.cancel();
    await _amplitudeSub?.cancel();
    _pendingPath = await _recorder.stop();
    recorderStatus.value = RecorderStatus.stopped;
  }

  void discard() {
    _pendingPath = null;
    _pendingClientId = null;
    uploadFailure.value = null;
    recorderStatus.value = RecorderStatus.idle;
  }

  Future<void> submit() async {
    final path = _pendingPath;
    if (path == null) return;
    _pendingClientId ??= randomClientAttemptId();

    submitting.value = true;
    try {
      final attempt = await _api.upload(activityId, _pendingClientId!, path);
      _pendingPath = null;
      _pendingClientId = null;
      uploadFailure.value = null;
      recorderStatus.value = RecorderStatus.idle;
      resultAttemptId.value = attempt.id;
      await load();
    } on ApiException catch (failure) {
      uploadFailure.value = failure.code == 'CRED002' ? UploadFailureKind.credential : UploadFailureKind.network;
    } finally {
      submitting.value = false;
    }
  }

  Future<void> rescore(String attemptId) async {
    rescoringId.value = attemptId;
    try {
      await _api.rescore(attemptId);
      await load();
    } finally {
      rescoringId.value = null;
    }
  }

  Future<void> rate(SpeakingRatingInput input) async {
    final updated = await _api.rate(activityId, input);
    final current = activity.value;
    if (current != null) {
      activity.value = current.copyWithRating(updated);
    }
  }

  Future<String> _pathFor(String attemptId) async {
    final cached = _audioPaths[attemptId];
    if (cached != null) return cached;
    final path = await _api.downloadAudio(attemptId);
    _audioPaths[attemptId] = path;
    return path;
  }

  /// Plays a stored attempt's recording in full, or stops it if it is already playing.
  Future<void> togglePlayAttempt(String attemptId) async {
    if (playingAttemptId.value == attemptId) {
      await _player.stop();
      playingAttemptId.value = null;
      return;
    }
    final path = await _pathFor(attemptId);
    playingLocal.value = false;
    playingAttemptId.value = attemptId;
    await _player.playFile(path);
    if (playingAttemptId.value == attemptId) playingAttemptId.value = null;
  }

  /// Plays one word's segment of a stored attempt, padded (A27, inside `AttemptAudioPlayer`).
  Future<void> playRange(String attemptId, int startMs, int durationMs) async {
    final path = await _pathFor(attemptId);
    playingLocal.value = false;
    playingAttemptId.value = attemptId;
    await _player.playRange(path, Duration(milliseconds: startMs), Duration(milliseconds: durationMs));
  }

  /// Plays the pending, not-yet-uploaded recording from local disk.
  Future<void> playPendingRecording() async {
    final path = _pendingPath;
    if (path == null) return;
    playingAttemptId.value = null;
    playingLocal.value = true;
    await _player.playFile(path);
    playingLocal.value = false;
  }

  Future<void> stopPlayback() async {
    await _player.stop();
    playingAttemptId.value = null;
    playingLocal.value = false;
  }

  @override
  void onClose() {
    _tickTimer?.cancel();
    _limitTimer?.cancel();
    _pollTimer?.cancel();
    _amplitudeSub?.cancel();
    _recorder.dispose();
    _player.dispose();
    super.onClose();
  }
}
