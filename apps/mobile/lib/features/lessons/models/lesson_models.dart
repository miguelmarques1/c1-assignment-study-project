import 'json_read.dart';
import 'pipeline_models.dart';

/// Mirrors `lessonHistoryStatusSchema` and `lessonHistoryStatusLabels`.
enum LessonHistoryStatus {
  processing('Processing'),
  ready('Ready'),
  blocked('Blocked'),
  failed('Failed'),
  tooShort('Too short'),
  recordingFailed('Recording failed');

  const LessonHistoryStatus(this.label);

  final String label;

  static LessonHistoryStatus fromWire(String value) => switch (value) {
    'ready' => ready,
    'blocked' => blocked,
    'failed' => failed,
    'too_short' => tooShort,
    'recording_failed' => recordingFailed,
    _ => processing,
  };

  /// Still moving, so the screen keeps polling (F19, A20).
  bool get isPending => this == processing || this == blocked;
}

/// Mirrors `lessonHistoryFlagSchema` and `lessonHistoryFlagLabels`.
enum LessonHistoryFlag {
  partial('Partial'),
  noScenario('No scenario'),
  endedUnexpectedly('Ended unexpectedly');

  const LessonHistoryFlag(this.label);

  final String label;

  static LessonHistoryFlag? fromWire(String value) => switch (value) {
    'partial' => partial,
    'no_scenario' => noScenario,
    'ended_unexpectedly' => endedUnexpectedly,
    _ => null,
  };
}

class LessonParticipant {
  const LessonParticipant({required this.userId, required this.displayName, required this.isMe});

  factory LessonParticipant.fromJson(Json json) => LessonParticipant(
    userId: json['userId'] as String,
    displayName: json['displayName'] as String,
    isMe: json['isMe'] as bool,
  );

  final String userId;
  final String displayName;
  final bool isMe;
}

/// One row of `GET /lessons`, and the header of `GET /lessons/:lessonId`.
class LessonSummary {
  const LessonSummary({
    required this.lessonId,
    required this.startedAt,
    required this.endedAt,
    required this.durationSeconds,
    required this.participants,
    required this.scenarioTitle,
    required this.vocabularyDomain,
    required this.status,
    required this.flags,
    required this.activeStage,
    required this.statusReason,
    required this.headline,
    required this.storageBytes,
  });

  factory LessonSummary.fromJson(Json json) => LessonSummary(
    lessonId: json['lessonId'] as String,
    startedAt: DateTime.parse(json['startedAt'] as String),
    endedAt: readDate(json['endedAt']),
    durationSeconds: readInt(json['durationSeconds']),
    participants: readList(json['participants'], LessonParticipant.fromJson),
    scenarioTitle: json['scenarioTitle'] as String?,
    vocabularyDomain: json['vocabularyDomain'] as String?,
    status: LessonHistoryStatus.fromWire(json['status'] as String),
    flags: readStrings(json['flags']).map(LessonHistoryFlag.fromWire).whereType<LessonHistoryFlag>().toList(),
    activeStage: json['activeStage'] == null ? null : PipelineStage(json['activeStage'] as String),
    statusReason: json['statusReason'] as String?,
    headline: json['headline'] as String?,
    storageBytes: readInt(json['storageBytes']) ?? 0,
  );

  final String lessonId;
  final DateTime startedAt;
  final DateTime? endedAt;
  final int? durationSeconds;
  final List<LessonParticipant> participants;
  final String? scenarioTitle;
  final String? vocabularyDomain;
  final LessonHistoryStatus status;
  final List<LessonHistoryFlag> flags;
  final PipelineStage? activeStage;
  final String? statusReason;
  final String? headline;
  final int storageBytes;
}

/// `GET /lessons`: newest first, keyset-paginated.
class LessonList {
  const LessonList({required this.lessons, required this.nextCursor, required this.totalStorageBytes});

  factory LessonList.fromJson(Json json) => LessonList(
    lessons: readList(json['lessons'], LessonSummary.fromJson),
    nextCursor: json['nextCursor'] as String?,
    totalStorageBytes: readInt(json['totalStorageBytes']) ?? 0,
  );

  final List<LessonSummary> lessons;
  final String? nextCursor;
  final int totalStorageBytes;
}

/// Another participant's stage, coarse by construction (F19, A10).
enum ParticipantStageState {
  notStarted('Not started'),
  pending('In progress'),
  completed('Done'),
  unavailable('Unavailable');

  const ParticipantStageState(this.label);

  final String label;

  static ParticipantStageState fromWire(String value) => switch (value) {
    'pending' => pending,
    'completed' => completed,
    'unavailable' => unavailable,
    _ => notStarted,
  };
}

class OtherParticipantStage {
  const OtherParticipantStage({required this.stage, required this.state, required this.startedAt, required this.finishedAt});

  factory OtherParticipantStage.fromJson(Json json) => OtherParticipantStage(
    stage: PipelineStage(json['stage'] as String),
    state: ParticipantStageState.fromWire(json['state'] as String),
    startedAt: readDate(json['startedAt']),
    finishedAt: readDate(json['finishedAt']),
  );

  final PipelineStage stage;
  final ParticipantStageState state;
  final DateTime? startedAt;
  final DateTime? finishedAt;
}

class OtherParticipantProcessing {
  const OtherParticipantProcessing({required this.userId, required this.displayName, required this.stages});

  factory OtherParticipantProcessing.fromJson(Json json) => OtherParticipantProcessing(
    userId: json['userId'] as String,
    displayName: json['displayName'] as String,
    stages: readList(json['stages'], OtherParticipantStage.fromJson),
  );

  final String userId;
  final String displayName;
  final List<OtherParticipantStage> stages;
}

/// `GET /lessons/:lessonId`: the summary plus the scenario step and everyone else's coarse stages.
class LessonDetail {
  const LessonDetail({
    required this.summary,
    required this.scenarioStatus,
    required this.myCardStatus,
    required this.others,
  });

  factory LessonDetail.fromJson(Json json) {
    final scenario = json['scenario'] as Json;
    return LessonDetail(
      summary: LessonSummary.fromJson(json),
      scenarioStatus: scenario['status'] as String,
      myCardStatus: scenario['myCardStatus'] as String?,
      others: readList(json['others'], OtherParticipantProcessing.fromJson),
    );
  }

  final LessonSummary summary;

  /// F06's `pending`, `ready`, `failed`, `no_scenario`, or `none`.
  final String scenarioStatus;

  /// The caller's own card only: `pending`, `ready`, `failed`, or null.
  final String? myCardStatus;
  final List<OtherParticipantProcessing> others;
}
