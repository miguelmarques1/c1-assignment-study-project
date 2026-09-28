/// Hand-written mirrors of `packages/shared/src/schemas/plan.ts` (F15).
/// Unknown fields are ignored, so an additive change on the API never breaks
/// an older app; an unknown wire value for an enum still renders (falling
/// back to a safe member) instead of crashing the screen.
library;

typedef Json = Map<String, dynamic>;

DateTime? _date(Object? value) => value == null ? null : DateTime.parse(value as String);

int? _int(Object? value) => value == null ? null : (value as num).round();

List<T> _list<T>(Object? value, T Function(Json json) parse) =>
    value == null ? const [] : (value as List).cast<Json>().map(parse).toList();

enum PlanActivityKind {
  listening('listening', 'Listening'),
  reading('reading', 'Reading'),
  vocabulary('vocabulary', 'Vocabulary'),
  grammar('grammar', 'Grammar'),
  errorReview('error_review', 'Error review'),
  writing('writing', 'Writing'),
  speaking('speaking', 'Speaking'),
  pronunciation('pronunciation', 'Pronunciation');

  const PlanActivityKind(this.wireValue, this.label);

  final String wireValue;
  final String label;

  static PlanActivityKind fromWire(String value) =>
      PlanActivityKind.values.firstWhere((kind) => kind.wireValue == value, orElse: () => PlanActivityKind.listening);
}

enum PlanActivityState {
  pending,
  inProgress,
  completed,
  skipped;

  static PlanActivityState fromWire(String value) => switch (value) {
    'pending' => pending,
    'in_progress' => inProgress,
    'completed' => completed,
    'skipped' => skipped,
    _ => pending,
  };
}

enum PlanSessionState {
  notStarted,
  inProgress,
  completed;

  static PlanSessionState fromWire(String value) => switch (value) {
    'not_started' => notStarted,
    'in_progress' => inProgress,
    'completed' => completed,
    _ => notStarted,
  };
}

enum StudyPlanStatus {
  active,
  archived;

  static StudyPlanStatus fromWire(String value) => value == 'archived' ? archived : active;
}

/// `lesson` is the full pipeline; the other two are F15's own request paths.
enum StudyPlanOrigin {
  lesson('lesson', 'From lesson'),
  recordingFailed('recording_failed', 'Recording failed'),
  analysisBlocked('analysis_blocked', 'Analysis blocked');

  const StudyPlanOrigin(this.wireValue, this.label);

  final String wireValue;
  final String label;

  static StudyPlanOrigin fromWire(String value) =>
      StudyPlanOrigin.values.firstWhere((origin) => origin.wireValue == value, orElse: () => StudyPlanOrigin.lesson);
}

enum DifficultyRating {
  tooEasy,
  justRight,
  tooHard;

  static DifficultyRating? fromWire(String? value) => switch (value) {
    'too_easy' => tooEasy,
    'just_right' => justRight,
    'too_hard' => tooHard,
    _ => null,
  };
}

/// Server-built sentence, already in the fixed display order (spec §5 "Notes").
class PlanNote {
  const PlanNote({required this.code, required this.text});

  factory PlanNote.fromJson(Json json) => PlanNote(code: json['code'] as String, text: json['text'] as String);

  final String code;
  final String text;
}

/// An error-taxonomy tag with its human-readable label.
class PlanTag {
  const PlanTag({required this.tag, required this.label});

  factory PlanTag.fromJson(Json json) => PlanTag(tag: json['tag'] as String, label: json['label'] as String);

  final String tag;
  final String label;
}

class PlanRatingCounts {
  const PlanRatingCounts({required this.tooEasy, required this.justRight, required this.tooHard, required this.notUseful});

  factory PlanRatingCounts.fromJson(Json json) => PlanRatingCounts(
    tooEasy: json['tooEasy'] as int,
    justRight: json['justRight'] as int,
    tooHard: json['tooHard'] as int,
    notUseful: json['notUseful'] as int,
  );

  final int tooEasy;
  final int justRight;
  final int tooHard;
  final int notUseful;
}

class PlanProgress {
  const PlanProgress({
    required this.total,
    required this.completed,
    required this.skipped,
    required this.inProgress,
    required this.pending,
    required this.completionPercent,
  });

  factory PlanProgress.fromJson(Json json) => PlanProgress(
    total: json['total'] as int,
    completed: json['completed'] as int,
    skipped: json['skipped'] as int,
    inProgress: json['inProgress'] as int,
    pending: json['pending'] as int,
    completionPercent: json['completionPercent'] as int,
  );

  final int total;
  final int completed;
  final int skipped;
  final int inProgress;
  final int pending;
  final int completionPercent;
}

class PlanActivityView {
  const PlanActivityView({
    required this.id,
    required this.day,
    required this.position,
    required this.kind,
    required this.contentItemId,
    required this.title,
    required this.estimatedMinutes,
    required this.targetTags,
    required this.rationale,
    required this.isReview,
    required this.carriedOver,
    required this.state,
    required this.startedAt,
    required this.completedAt,
    required this.skippedAt,
    required this.skipReason,
    required this.rating,
    required this.notUseful,
  });

  factory PlanActivityView.fromJson(Json json) => PlanActivityView(
    id: json['id'] as String,
    day: json['day'] as int,
    position: json['position'] as int,
    kind: PlanActivityKind.fromWire(json['kind'] as String),
    contentItemId: json['contentItemId'] as String?,
    title: json['title'] as String,
    estimatedMinutes: json['estimatedMinutes'] as int,
    targetTags: _list(json['targetTags'], PlanTag.fromJson),
    rationale: json['rationale'] as String,
    isReview: json['isReview'] as bool,
    carriedOver: json['carriedOver'] as bool,
    state: PlanActivityState.fromWire(json['state'] as String),
    startedAt: _date(json['startedAt']),
    completedAt: _date(json['completedAt']),
    skippedAt: _date(json['skippedAt']),
    skipReason: json['skipReason'] as String?,
    rating: DifficultyRating.fromWire(json['rating'] as String?),
    notUseful: json['notUseful'] as bool,
  );

  final String id;
  final int day;
  final int position;
  final PlanActivityKind kind;
  /// Null exactly for `writing`, `speaking` and `pronunciation`.
  final String? contentItemId;
  final String title;
  final int estimatedMinutes;
  final List<PlanTag> targetTags;
  final String rationale;
  final bool isReview;
  final bool carriedOver;
  final PlanActivityState state;
  final DateTime? startedAt;
  final DateTime? completedAt;
  final DateTime? skippedAt;
  final String? skipReason;
  final DifficultyRating? rating;
  final bool notUseful;
}

class PlanSessionSummary {
  const PlanSessionSummary({
    required this.completed,
    required this.skipped,
    required this.correct,
    required this.questions,
    required this.timeSpentSeconds,
  });

  factory PlanSessionSummary.fromJson(Json json) => PlanSessionSummary(
    completed: json['completed'] as int,
    skipped: json['skipped'] as int,
    correct: _int(json['correct']),
    questions: _int(json['questions']),
    timeSpentSeconds: _int(json['timeSpentSeconds']),
  );

  final int completed;
  final int skipped;
  final int? correct;
  final int? questions;
  final int? timeSpentSeconds;
}

class PlanSessionView {
  const PlanSessionView({
    required this.day,
    required this.estimatedMinutes,
    required this.state,
    required this.completedAt,
    required this.summary,
    required this.activities,
  });

  factory PlanSessionView.fromJson(Json json) => PlanSessionView(
    day: json['day'] as int,
    estimatedMinutes: json['estimatedMinutes'] as int,
    state: PlanSessionState.fromWire(json['state'] as String),
    completedAt: _date(json['completedAt']),
    summary: PlanSessionSummary.fromJson(json['summary'] as Json),
    activities: _list(json['activities'], PlanActivityView.fromJson),
  );

  final int day;
  final int estimatedMinutes;
  final PlanSessionState state;
  final DateTime? completedAt;
  final PlanSessionSummary summary;
  final List<PlanActivityView> activities;
}

/// The full shape of one plan — `GET /plans/:planId` and `GET /plans/current`'s `plan` field.
class StudyPlanView {
  const StudyPlanView({
    required this.id,
    required this.status,
    required this.origin,
    required this.lessonId,
    required this.lessonDate,
    required this.createdAt,
    required this.activatedAt,
    required this.archivedAt,
    required this.summaryLine,
    required this.focusTags,
    required this.notes,
    required this.progress,
    required this.ratings,
    required this.sessions,
  });

  factory StudyPlanView.fromJson(Json json) => StudyPlanView(
    id: json['id'] as String,
    status: StudyPlanStatus.fromWire(json['status'] as String),
    origin: StudyPlanOrigin.fromWire(json['origin'] as String),
    lessonId: json['lessonId'] as String,
    lessonDate: DateTime.parse(json['lessonDate'] as String),
    createdAt: DateTime.parse(json['createdAt'] as String),
    activatedAt: _date(json['activatedAt']),
    archivedAt: _date(json['archivedAt']),
    summaryLine: json['summaryLine'] as String,
    focusTags: _list(json['focusTags'], PlanTag.fromJson),
    notes: _list(json['notes'], PlanNote.fromJson),
    progress: PlanProgress.fromJson(json['progress'] as Json),
    ratings: PlanRatingCounts.fromJson(json['ratings'] as Json),
    sessions: _list(json['sessions'], PlanSessionView.fromJson),
  );

  final String id;
  final StudyPlanStatus status;
  final StudyPlanOrigin origin;
  final String lessonId;
  final DateTime lessonDate;
  final DateTime createdAt;
  /// Null for a plan archived on arrival (superseded before ever being shown).
  final DateTime? activatedAt;
  final DateTime? archivedAt;
  final String summaryLine;
  final List<PlanTag> focusTags;
  final List<PlanNote> notes;
  final PlanProgress progress;
  final PlanRatingCounts ratings;
  /// Always 7, ordered by `day`.
  final List<PlanSessionView> sessions;
}

/// A build that will replace (or create) the caller's active plan is in progress.
class PlanPreparing {
  const PlanPreparing({
    required this.lessonId,
    required this.origin,
    required this.since,
    required this.progressDone,
    required this.progressTotal,
  });

  factory PlanPreparing.fromJson(Json json) {
    final progress = json['progress'] as Json?;
    return PlanPreparing(
      lessonId: json['lessonId'] as String,
      origin: StudyPlanOrigin.fromWire(json['origin'] as String),
      since: DateTime.parse(json['since'] as String),
      progressDone: _int(progress?['done']),
      progressTotal: _int(progress?['total']),
    );
  }

  final String lessonId;
  final StudyPlanOrigin origin;
  final DateTime since;
  /// F14's settled slots over planned slots, while generation runs; null otherwise.
  final int? progressDone;
  final int? progressTotal;
}

/// The newest build that outranks the active plan failed.
class PlanFailure {
  const PlanFailure({
    required this.lessonId,
    required this.origin,
    required this.failedAt,
    required this.message,
    required this.retryable,
  });

  factory PlanFailure.fromJson(Json json) => PlanFailure(
    lessonId: json['lessonId'] as String,
    origin: StudyPlanOrigin.fromWire(json['origin'] as String),
    failedAt: DateTime.parse(json['failedAt'] as String),
    message: json['message'] as String,
    retryable: json['retryable'] as bool,
  );

  final String lessonId;
  final StudyPlanOrigin origin;
  final DateTime failedAt;
  final String message;
  final bool retryable;
}

/// `GET /plans/current`.
class CurrentPlanView {
  const CurrentPlanView({required this.serverTime, required this.plan, required this.preparing, required this.failure});

  factory CurrentPlanView.fromJson(Json json) => CurrentPlanView(
    serverTime: DateTime.parse(json['serverTime'] as String),
    plan: json['plan'] == null ? null : StudyPlanView.fromJson(json['plan'] as Json),
    preparing: json['preparing'] == null ? null : PlanPreparing.fromJson(json['preparing'] as Json),
    failure: json['failure'] == null ? null : PlanFailure.fromJson(json['failure'] as Json),
  );

  final DateTime serverTime;
  final StudyPlanView? plan;
  final PlanPreparing? preparing;
  /// Null while [preparing] is set.
  final PlanFailure? failure;
}

class PlanHistoryItem {
  const PlanHistoryItem({
    required this.id,
    required this.status,
    required this.origin,
    required this.lessonId,
    required this.lessonDate,
    required this.createdAt,
    required this.activatedAt,
    required this.archivedAt,
    required this.summaryLine,
    required this.activityCount,
    required this.completedCount,
    required this.skippedCount,
    required this.completionPercent,
    required this.ratings,
  });

  factory PlanHistoryItem.fromJson(Json json) => PlanHistoryItem(
    id: json['id'] as String,
    status: StudyPlanStatus.fromWire(json['status'] as String),
    origin: StudyPlanOrigin.fromWire(json['origin'] as String),
    lessonId: json['lessonId'] as String,
    lessonDate: DateTime.parse(json['lessonDate'] as String),
    createdAt: DateTime.parse(json['createdAt'] as String),
    activatedAt: _date(json['activatedAt']),
    archivedAt: _date(json['archivedAt']),
    summaryLine: json['summaryLine'] as String,
    activityCount: json['activityCount'] as int,
    completedCount: json['completedCount'] as int,
    skippedCount: json['skippedCount'] as int,
    completionPercent: json['completionPercent'] as int,
    ratings: PlanRatingCounts.fromJson(json['ratings'] as Json),
  );

  final String id;
  final StudyPlanStatus status;
  final StudyPlanOrigin origin;
  final String lessonId;
  final DateTime lessonDate;
  final DateTime createdAt;
  final DateTime? activatedAt;
  final DateTime? archivedAt;
  final String summaryLine;
  final int activityCount;
  final int completedCount;
  final int skippedCount;
  final int completionPercent;
  final PlanRatingCounts ratings;
}

/// `GET /plans` — up to the 100 newest, active and archived.
class PlanHistoryView {
  const PlanHistoryView({required this.plans});

  factory PlanHistoryView.fromJson(Json json) => PlanHistoryView(plans: _list(json['plans'], PlanHistoryItem.fromJson));

  final List<PlanHistoryItem> plans;
}
