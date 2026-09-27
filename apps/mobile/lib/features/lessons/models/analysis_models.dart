import 'json_read.dart';

class AnalysisCompetencyView {
  const AnalysisCompetencyView({required this.competency, required this.score, required this.justification, required this.delta});

  factory AnalysisCompetencyView.fromJson(Json json) => AnalysisCompetencyView(
    competency: json['competency'] as String,
    score: readInt(json['score'])!,
    justification: json['justification'] as String,
    delta: readInt(json['delta']),
  );

  final String competency;
  final int score;
  final String justification;

  /// Null on the caller's first analysed lesson.
  final int? delta;

  String get label => humanize(competency);
}

/// A span of the correction; `changed` is the part to emphasize (server-built, F19 A15).
class CorrectionSegment {
  const CorrectionSegment({required this.text, required this.changed});

  factory CorrectionSegment.fromJson(Json json) =>
      CorrectionSegment(text: json['text'] as String, changed: json['changed'] as bool);

  final String text;
  final bool changed;
}

class ErrorRecurrence {
  const ErrorRecurrence({required this.count, required this.label});

  factory ErrorRecurrence.fromJson(Json json) =>
      ErrorRecurrence(count: readInt(json['count'])!, label: json['label'] as String);

  final int count;

  /// `4th time`.
  final String label;
}

class AnalysisErrorView {
  const AnalysisErrorView({
    required this.quote,
    required this.correction,
    required this.correctionSegments,
    required this.explanation,
    required this.severity,
    required this.tag,
    required this.tagLabel,
    required this.recurrence,
    required this.utteranceId,
  });

  factory AnalysisErrorView.fromJson(Json json) => AnalysisErrorView(
    quote: json['quote'] as String,
    correction: json['correction'] as String,
    correctionSegments: readList(json['correctionSegments'], CorrectionSegment.fromJson),
    explanation: json['explanation'] as String,
    severity: json['severity'] as String,
    tag: json['tag'] as String,
    tagLabel: json['tagLabel'] as String,
    recurrence: readObject(json['recurrence'], ErrorRecurrence.fromJson),
    utteranceId: json['utteranceId'] as String?,
  );

  final String quote;
  final String correction;
  final List<CorrectionSegment> correctionSegments;
  final String explanation;

  /// `minor`, `moderate` or `major`.
  final String severity;
  final String tag;
  final String tagLabel;
  final ErrorRecurrence? recurrence;
  final String? utteranceId;
}

class ScenarioFitView {
  const ScenarioFitView({
    required this.roleLabel,
    required this.registerExpected,
    required this.registerMatched,
    required this.registerComment,
    required this.expressionsUsed,
    required this.expressionsNotUsed,
  });

  factory ScenarioFitView.fromJson(Json json) => ScenarioFitView(
    roleLabel: json['roleLabel'] as String,
    registerExpected: json['registerExpected'] as String,
    registerMatched: json['registerMatched'] as bool,
    registerComment: json['registerComment'] as String,
    expressionsUsed: readStrings(json['expressionsUsed']),
    expressionsNotUsed: readStrings(json['expressionsNotUsed']),
  );

  final String roleLabel;
  final String registerExpected;
  final bool registerMatched;
  final String registerComment;
  final List<String> expressionsUsed;
  final List<String> expressionsNotUsed;
}

class LessonAnalysisResult {
  const LessonAnalysisResult({
    required this.competencies,
    required this.strengths,
    required this.errors,
    required this.recurringTags,
    required this.scenarioContext,
    required this.scenarioFit,
    required this.topicsToPractice,
    required this.notes,
  });

  factory LessonAnalysisResult.fromJson(Json json) => LessonAnalysisResult(
    competencies: readList(json['competencies'], AnalysisCompetencyView.fromJson),
    strengths: readStrings(json['strengths']),
    errors: readList(json['errors'], AnalysisErrorView.fromJson),
    recurringTags: readStrings(json['recurringTags']),
    scenarioContext: json['scenarioContext'] as String,
    scenarioFit: readObject(json['scenarioFit'], ScenarioFitView.fromJson),
    topicsToPractice: readStrings(json['topicsToPractice']),
    notes: readStrings(json['notes']),
  );

  final List<AnalysisCompetencyView> competencies;
  final List<String> strengths;
  final List<AnalysisErrorView> errors;
  final List<String> recurringTags;

  /// `full`, `situation_only` or `none`.
  final String scenarioContext;
  final ScenarioFitView? scenarioFit;
  final List<String> topicsToPractice;
  final List<String> notes;
}

/// `GET /lessons/:lessonId/analysis` — the caller's own data only.
class LessonAnalysisView {
  const LessonAnalysisView({required this.lessonId, required this.status, required this.analysis});

  factory LessonAnalysisView.fromJson(Json json) => LessonAnalysisView(
    lessonId: json['lessonId'] as String,
    status: json['status'] as String,
    analysis: readObject(json['analysis'], LessonAnalysisResult.fromJson),
  );

  final String lessonId;

  /// `pending`, `ready`, `failed` or `unavailable`.
  final String status;
  final LessonAnalysisResult? analysis;
}
