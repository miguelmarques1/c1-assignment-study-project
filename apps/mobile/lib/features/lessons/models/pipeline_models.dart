import 'json_read.dart';

/// A pipeline stage by its wire value. Mirrors `pipelineStageLabels` in
/// `packages/shared`: a stage the app does not know yet (one a later
/// feature appends) still renders, with its wire value humanized.
class PipelineStage {
  const PipelineStage(this.wire);

  final String wire;

  static const order = [
    PipelineStage('recording'),
    PipelineStage('transcription'),
    PipelineStage('excerpt_selection'),
    PipelineStage('pronunciation_assessment'),
    PipelineStage('lesson_analysis'),
    PipelineStage('profile_update'),
    PipelineStage('plan_generation'),
  ];

  static const _labels = <String, (String, String)>{
    'recording': ('Recorded', 'Recording'),
    'transcription': ('Transcribed', 'Transcribing'),
    'excerpt_selection': ('Excerpts selected', 'Selecting excerpts'),
    'pronunciation_assessment': ('Pronunciation assessed', 'Assessing pronunciation'),
    'lesson_analysis': ('Analyzed', 'Analyzing'),
    'profile_update': ('Profile updated', 'Updating profile'),
    'plan_generation': ('Plan generated', 'Generating plan'),
  };

  bool get isKnown => _labels.containsKey(wire);

  /// Once it has happened: `Transcribed`.
  String get title => _labels[wire]?.$1 ?? humanize(wire);

  /// While it runs: `Transcribing`.
  String get active => _labels[wire]?.$2 ?? humanize(wire);

  @override
  bool operator ==(Object other) => other is PipelineStage && other.wire == wire;

  @override
  int get hashCode => wire.hashCode;
}

enum PipelineStageStatus {
  queued,
  running,
  retrying,
  blockedMissingKey,
  failed,
  completed,
  unknown;

  static PipelineStageStatus fromWire(String value) => switch (value) {
    'queued' => queued,
    'running' => running,
    'retrying' => retrying,
    'blocked_missing_key' => blockedMissingKey,
    'failed' => failed,
    'completed' => completed,
    _ => unknown,
  };
}

class PipelineStageView {
  const PipelineStageView({
    required this.stage,
    required this.status,
    required this.startedAt,
    required this.finishedAt,
    required this.lastAttemptAt,
    required this.nextAttemptAt,
    required this.reason,
    required this.providerMessage,
    required this.blockedProvider,
    required this.retryable,
    required this.progressDone,
    required this.progressTotal,
  });

  factory PipelineStageView.fromJson(Json json) {
    final progress = json['progress'] as Json?;
    return PipelineStageView(
      stage: PipelineStage(json['stage'] as String),
      status: PipelineStageStatus.fromWire(json['status'] as String),
      startedAt: readDate(json['startedAt']),
      finishedAt: readDate(json['finishedAt']),
      lastAttemptAt: readDate(json['lastAttemptAt']),
      nextAttemptAt: readDate(json['nextAttemptAt']),
      reason: json['reason'] as String?,
      providerMessage: json['providerMessage'] as String?,
      blockedProvider: json['blockedProvider'] as String?,
      retryable: json['retryable'] as bool? ?? false,
      progressDone: readInt(progress?['done']),
      progressTotal: readInt(progress?['total']),
    );
  }

  final PipelineStage stage;
  final PipelineStageStatus status;
  final DateTime? startedAt;
  final DateTime? finishedAt;
  final DateTime? lastAttemptAt;
  final DateTime? nextAttemptAt;
  final String? reason;
  final String? providerMessage;
  final String? blockedProvider;
  final bool retryable;
  final int? progressDone;
  final int? progressTotal;
}

/// `GET /lessons/:lessonId/pipeline` — the caller's own branch only.
class LessonPipelineView {
  const LessonPipelineView({required this.lessonId, required this.serverTime, required this.stages, required this.hasBranch});

  factory LessonPipelineView.fromJson(Json json) {
    final branch = json['branch'] as Json?;
    return LessonPipelineView(
      lessonId: json['lessonId'] as String,
      serverTime: DateTime.parse(json['serverTime'] as String),
      hasBranch: branch != null,
      stages: readList(branch?['stages'], PipelineStageView.fromJson),
    );
  }

  final String lessonId;
  final DateTime serverTime;
  final bool hasBranch;
  final List<PipelineStageView> stages;

  PipelineStageView? stage(PipelineStage stage) {
    for (final view in stages) {
      if (view.stage == stage) return view;
    }
    return null;
  }
}
