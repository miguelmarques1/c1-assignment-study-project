import 'json_read.dart';

/// The parts of `GET /lessons/:lessonId/recording` the Status tab uses — the caller's own recording.
class LessonRecordingView {
  const LessonRecordingView({
    required this.lessonId,
    required this.myRecordingStatus,
    required this.myCapturedSeconds,
    required this.myBranchRetryable,
  });

  factory LessonRecordingView.fromJson(Json json) {
    final mine = json['mine'] as Json;
    final branch = mine['branch'] as Json?;
    return LessonRecordingView(
      lessonId: json['lessonId'] as String,
      myRecordingStatus: mine['recordingStatus'] as String,
      myCapturedSeconds: readInt(mine['capturedSeconds']),
      myBranchRetryable: branch?['retryable'] as bool? ?? false,
    );
  }

  final String lessonId;

  /// F07's participant status: `complete`, `partial`, `missing`, …
  final String myRecordingStatus;
  final int? myCapturedSeconds;

  /// Whether F07's `POST …/recording/retry` would re-run the caller's recording step.
  final bool myBranchRetryable;
}
