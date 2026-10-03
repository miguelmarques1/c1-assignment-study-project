/// Hand-written mirrors of `packages/shared/src/schemas/writing.ts` (F17).
/// Unknown fields are ignored and an unrecognized wire value for an enum
/// falls back to a safe member, exactly as `plan_models.dart`'s tolerant
/// parsing — an additive change on the API never breaks an older app.
library;

import '../lessons/models/analysis_models.dart' show CorrectionSegment, ErrorRecurrence;
import '../plan/plan_models.dart' show PlanActivityState, PlanTag;

typedef Json = Map<String, dynamic>;

DateTime? _date(Object? value) => value == null ? null : DateTime.parse(value as String);

List<T> _list<T>(Object? value, T Function(Json json) parse) =>
    value == null ? const [] : (value as List).cast<Json>().map(parse).toList();

T? _object<T>(Object? value, T Function(Json json) parse) => value == null ? null : parse(value as Json);

/// The PRD's minimum, an upper bound and a draft's storage cap (spec A19).
const int writingMinSubmitWords = 80;
const int writingExpectedWordsMin = 120;
const int writingExpectedWordsMax = 250;
const int writingMaxSubmitWords = 600;
const int writingDraftMaxChars = 10000;
const int writingDailyCorrectionLimit = 10;
const Duration writingLocalSaveInterval = Duration(seconds: 5);
const Duration writingServerSaveInterval = Duration(seconds: 30);
const Duration writingPollInterval = Duration(seconds: 3);
const int writingActiveSecondsMaxDelta = 600;

enum WritingTaskStatus {
  draft,
  correcting,
  uncorrected,
  correctionFailed,
  corrected;

  static WritingTaskStatus fromWire(String value) => switch (value) {
    'draft' => draft,
    'correcting' => correcting,
    'uncorrected' => uncorrected,
    'correction_failed' => correctionFailed,
    'corrected' => corrected,
    _ => draft,
  };
}

enum WritingScoreDimension {
  grammar,
  vocabulary,
  coherence,
  taskAchievement;

  static WritingScoreDimension fromWire(String value) => switch (value) {
    'grammar' => grammar,
    'vocabulary' => vocabulary,
    'coherence' => coherence,
    'task_achievement' => taskAchievement,
    _ => grammar,
  };
}

enum WritingFailureCode {
  requestFailed,
  invalidOutput,
  geminiKey;

  static WritingFailureCode fromWire(String value) => switch (value) {
    'request_failed' => requestFailed,
    'invalid_output' => invalidOutput,
    'gemini_key' => geminiKey,
    _ => requestFailed,
  };
}

class WritingTaskView {
  const WritingTaskView({required this.heading, required this.statement, required this.targetTags});

  factory WritingTaskView.fromJson(Json json) => WritingTaskView(
    heading: json['heading'] as String,
    statement: json['statement'] as String,
    targetTags: _list(json['targetTags'], PlanTag.fromJson),
  );

  final String heading;
  final String statement;
  final List<PlanTag> targetTags;
}

class WritingDraftView {
  const WritingDraftView({required this.text, required this.revision, required this.savedAt});

  factory WritingDraftView.fromJson(Json json) =>
      WritingDraftView(text: json['text'] as String, revision: json['revision'] as int, savedAt: _date(json['savedAt']));

  final String text;
  final int revision;
  final DateTime? savedAt;
}

class WritingScoreView {
  const WritingScoreView({required this.dimension, required this.label, required this.score});

  factory WritingScoreView.fromJson(Json json) => WritingScoreView(
    dimension: WritingScoreDimension.fromWire(json['dimension'] as String),
    label: json['label'] as String,
    score: json['score'] as int,
  );

  final WritingScoreDimension dimension;
  final String label;
  final int score;
}

class WritingHighlightSegment {
  const WritingHighlightSegment({required this.text, required this.errorIndexes});

  factory WritingHighlightSegment.fromJson(Json json) =>
      WritingHighlightSegment(text: json['text'] as String, errorIndexes: (json['errorIndexes'] as List).cast<int>());

  final String text;
  final List<int> errorIndexes;
}

class WritingRevisionSegment {
  const WritingRevisionSegment({required this.text, required this.changed});

  factory WritingRevisionSegment.fromJson(Json json) =>
      WritingRevisionSegment(text: json['text'] as String, changed: json['changed'] as bool);

  final String text;
  final bool changed;
}

class WritingErrorView {
  const WritingErrorView({
    required this.index,
    required this.quote,
    required this.tag,
    required this.tagLabel,
    required this.correction,
    required this.correctionSegments,
    required this.explanation,
  });

  factory WritingErrorView.fromJson(Json json) => WritingErrorView(
    index: json['index'] as int,
    quote: json['quote'] as String,
    tag: json['tag'] as String,
    tagLabel: json['tagLabel'] as String,
    correction: json['correction'] as String,
    correctionSegments: _list(json['correctionSegments'], CorrectionSegment.fromJson),
    explanation: json['explanation'] as String,
  );

  final int index;
  final String quote;
  final String tag;
  final String tagLabel;
  final String correction;
  final List<CorrectionSegment> correctionSegments;
  final String explanation;
}

class WritingErrorGroupView {
  const WritingErrorGroupView({required this.tag, required this.tagLabel, required this.errorIndexes, required this.recurrence});

  factory WritingErrorGroupView.fromJson(Json json) => WritingErrorGroupView(
    tag: json['tag'] as String,
    tagLabel: json['tagLabel'] as String,
    errorIndexes: (json['errorIndexes'] as List).cast<int>(),
    recurrence: _object(json['recurrence'], ErrorRecurrence.fromJson),
  );

  final String tag;
  final String tagLabel;
  final List<int> errorIndexes;
  final ErrorRecurrence? recurrence;
}

class WritingCorrectionView {
  const WritingCorrectionView({
    required this.correctedAt,
    required this.overallComment,
    required this.scores,
    required this.text,
    required this.revision,
    required this.errors,
    required this.errorGroups,
  });

  factory WritingCorrectionView.fromJson(Json json) => WritingCorrectionView(
    correctedAt: DateTime.parse(json['correctedAt'] as String),
    overallComment: json['overallComment'] as String,
    scores: _list(json['scores'], WritingScoreView.fromJson),
    text: _list(json['text'], WritingHighlightSegment.fromJson),
    revision: _list(json['revision'], WritingRevisionSegment.fromJson),
    errors: _list(json['errors'], WritingErrorView.fromJson),
    errorGroups: _list(json['errorGroups'], WritingErrorGroupView.fromJson),
  );

  final DateTime correctedAt;
  final String overallComment;
  final List<WritingScoreView> scores;
  final List<WritingHighlightSegment> text;
  final List<WritingRevisionSegment> revision;
  final List<WritingErrorView> errors;
  final List<WritingErrorGroupView> errorGroups;
}

class WritingFailureView {
  const WritingFailureView({required this.code, required this.message});

  factory WritingFailureView.fromJson(Json json) =>
      WritingFailureView(code: WritingFailureCode.fromWire(json['code'] as String), message: json['message'] as String);

  final WritingFailureCode code;
  final String message;
}

class WritingLimitView {
  const WritingLimitView({required this.max, required this.used, required this.resetsAt});

  factory WritingLimitView.fromJson(Json json) =>
      WritingLimitView(max: json['max'] as int, used: json['used'] as int, resetsAt: _date(json['resetsAt']));

  final int max;
  final int used;
  final DateTime? resetsAt;
}

class WritingSubmissionView {
  const WritingSubmissionView({required this.geminiKeyUsable, required this.dailyLimit});

  factory WritingSubmissionView.fromJson(Json json) => WritingSubmissionView(
    geminiKeyUsable: json['geminiKeyUsable'] as bool,
    dailyLimit: WritingLimitView.fromJson(json['dailyLimit'] as Json),
  );

  final bool geminiKeyUsable;
  final WritingLimitView dailyLimit;
}

/// The body of every writing route (spec §5).
class WritingActivityView {
  const WritingActivityView({
    required this.activityId,
    required this.taskId,
    required this.planId,
    required this.activityState,
    required this.readOnly,
    required this.title,
    required this.task,
    required this.status,
    required this.draft,
    required this.submittedAt,
    required this.failure,
    required this.correction,
    required this.submission,
    required this.serverTime,
  });

  factory WritingActivityView.fromJson(Json json) => WritingActivityView(
    activityId: json['activityId'] as String,
    taskId: json['taskId'] as String,
    planId: json['planId'] as String,
    activityState: PlanActivityState.fromWire(json['activityState'] as String),
    readOnly: json['readOnly'] as bool,
    title: json['title'] as String,
    task: WritingTaskView.fromJson(json['task'] as Json),
    status: WritingTaskStatus.fromWire(json['status'] as String),
    draft: WritingDraftView.fromJson(json['draft'] as Json),
    submittedAt: _date(json['submittedAt']),
    failure: _object(json['failure'], WritingFailureView.fromJson),
    correction: _object(json['correction'], WritingCorrectionView.fromJson),
    submission: WritingSubmissionView.fromJson(json['submission'] as Json),
    serverTime: DateTime.parse(json['serverTime'] as String),
  );

  final String activityId;
  final String taskId;
  final String planId;
  final PlanActivityState activityState;
  final bool readOnly;
  final String title;
  final WritingTaskView task;
  final WritingTaskStatus status;
  final WritingDraftView draft;
  final DateTime? submittedAt;
  final WritingFailureView? failure;
  final WritingCorrectionView? correction;
  final WritingSubmissionView submission;
  final DateTime serverTime;
}

class WritingDraftSaved {
  const WritingDraftSaved({required this.revision, required this.savedAt});

  factory WritingDraftSaved.fromJson(Json json) =>
      WritingDraftSaved(revision: json['revision'] as int, savedAt: DateTime.parse(json['savedAt'] as String));

  final int revision;
  final DateTime savedAt;
}

/// `WRIT004`'s `details.draft`, and the local store's own reconciliation input.
class WritingDraftConflict {
  const WritingDraftConflict({required this.text, required this.revision, required this.savedAt});

  factory WritingDraftConflict.fromJson(Json json) =>
      WritingDraftConflict(text: json['text'] as String, revision: json['revision'] as int, savedAt: _date(json['savedAt']));

  final String text;
  final int revision;
  final DateTime? savedAt;
}

/// `WRIT003`'s `details`.
class WritingLimitDetails {
  const WritingLimitDetails({required this.limit, required this.used, required this.resetsAt});

  factory WritingLimitDetails.fromJson(Json json) =>
      WritingLimitDetails(limit: json['limit'] as int, used: json['used'] as int, resetsAt: DateTime.parse(json['resetsAt'] as String));

  final int limit;
  final int used;
  final DateTime resetsAt;
}
