/// Hand-written mirrors of `packages/shared/src/schemas/activity.ts` (F16).
/// Unknown fields are ignored, and an unknown enum value or question format
/// falls back to a safe member (an unscored question) instead of crashing the
/// screen, as `plan_models.dart` does.
library;

import '../lessons/models/json_read.dart';
import '../plan/plan_models.dart' hide Json;

String ratingWire(DifficultyRating rating) => switch (rating) {
  DifficultyRating.tooEasy => 'too_easy',
  DifficultyRating.justRight => 'just_right',
  DifficultyRating.tooHard => 'too_hard',
};

enum UnscoredReason {
  formatUnavailable,
  answerKeyInvalid;

  static UnscoredReason fromWire(String? value) =>
      value == 'answer_key_invalid' ? answerKeyInvalid : formatUnavailable;

  String get message => switch (this) {
    formatUnavailable => "This question type isn't available yet.",
    answerKeyInvalid => 'This question could not be corrected.',
  };
}

/// A question as the client sees it before submitting: never an answer or an explanation.
sealed class ObjectiveQuestion {
  const ObjectiveQuestion({required this.index, required this.prompt});

  factory ObjectiveQuestion.fromJson(Json json) {
    final index = json['index'] as int;
    final prompt = json['prompt'] as String?;
    switch (json['format']) {
      case 'multiple_choice':
        return MultipleChoiceQuestion(index: index, prompt: prompt ?? '', options: readStrings(json['options']));
      case 'fill_blank':
        return FillBlankQuestion(
          index: index,
          prompt: prompt ?? '',
          before: json['before'] as String? ?? '',
          after: json['after'] as String? ?? '',
          blankLength: readInt(json['blankLength']) ?? 8,
        );
      default:
        return UnscoredQuestion(
          index: index,
          prompt: prompt,
          reason: UnscoredReason.fromWire(json['reason'] as String?),
        );
    }
  }

  final int index;
  final String? prompt;

  bool get isScored => this is! UnscoredQuestion;
}

class MultipleChoiceQuestion extends ObjectiveQuestion {
  const MultipleChoiceQuestion({required super.index, required String super.prompt, required this.options});

  final List<String> options;
}

class FillBlankQuestion extends ObjectiveQuestion {
  const FillBlankQuestion({
    required super.index,
    required String super.prompt,
    required this.before,
    required this.after,
    required this.blankLength,
  });

  final String before;
  final String after;
  final int blankLength;
}

class UnscoredQuestion extends ObjectiveQuestion {
  const UnscoredQuestion({required super.index, required super.prompt, required this.reason});

  final UnscoredReason reason;
}

/// One answer. [optionIndex] for multiple choice, [text] for fill-in-the-blank.
class ObjectiveAnswer {
  const ObjectiveAnswer.choice({required this.index, required int this.optionIndex}) : text = null;
  const ObjectiveAnswer.text({required this.index, required String this.text}) : optionIndex = null;

  static ObjectiveAnswer? tryFromJson(Object? value) {
    if (value is! Map) return null;
    final json = value.cast<String, dynamic>();
    final index = json['index'];
    if (index is! int) return null;
    if (json['format'] == 'multiple_choice' && json['optionIndex'] is int) {
      return ObjectiveAnswer.choice(index: index, optionIndex: json['optionIndex'] as int);
    }
    if (json['format'] == 'fill_blank' && json['text'] is String) {
      return ObjectiveAnswer.text(index: index, text: json['text'] as String);
    }
    return null;
  }

  final int index;
  final int? optionIndex;
  final String? text;

  bool get isChoice => optionIndex != null;

  Map<String, Object?> toJson() => isChoice
      ? {'index': index, 'format': 'multiple_choice', 'optionIndex': optionIndex}
      : {'index': index, 'format': 'fill_blank', 'text': text};
}

class ObjectivePassage {
  const ObjectivePassage({required this.isTranscript, required this.text});

  factory ObjectivePassage.fromJson(Json json) =>
      ObjectivePassage(isTranscript: json['kind'] == 'transcript', text: json['text'] as String);

  final bool isTranscript;
  final String text;

  String get heading => isTranscript ? 'Transcript' : 'Text';
}

class ObjectiveSource {
  const ObjectiveSource({required this.name, required this.url});

  factory ObjectiveSource.fromJson(Json json) =>
      ObjectiveSource(name: json['name'] as String, url: json['url'] as String?);

  final String name;
  final String? url;
}

class ObjectiveItem {
  const ObjectiveItem({
    required this.type,
    required this.title,
    required this.passage,
    required this.hasAudio,
    required this.source,
    required this.questionsFingerprint,
    required this.questions,
  });

  factory ObjectiveItem.fromJson(Json json) => ObjectiveItem(
    type: PlanActivityKind.fromWire(json['type'] as String),
    title: json['title'] as String,
    passage: readObject(json['passage'], ObjectivePassage.fromJson),
    hasAudio: json['hasAudio'] as bool? ?? false,
    source: readObject(json['source'], ObjectiveSource.fromJson),
    questionsFingerprint: json['questionsFingerprint'] as String,
    questions: readList(json['questions'], ObjectiveQuestion.fromJson),
  );

  final PlanActivityKind type;
  final String title;
  final ObjectivePassage? passage;
  final bool hasAudio;
  final ObjectiveSource? source;
  final String questionsFingerprint;
  final List<ObjectiveQuestion> questions;
}

class ObjectiveAttempt {
  const ObjectiveAttempt({required this.id, required this.submitted});

  factory ObjectiveAttempt.fromJson(Json json) =>
      ObjectiveAttempt(id: json['id'] as String, submitted: json['status'] == 'submitted');

  final String id;
  final bool submitted;
}

enum ResultOutcome {
  correct,
  incorrect,
  unscored;

  static ResultOutcome fromWire(String? value) => switch (value) {
    'correct' => correct,
    'incorrect' => incorrect,
    _ => unscored,
  };

  String get label => switch (this) {
    correct => 'Correct',
    incorrect => 'Incorrect',
    unscored => 'Not scored',
  };
}

class ResultQuestion {
  const ResultQuestion({
    required this.index,
    required this.prompt,
    required this.outcome,
    required this.response,
    required this.correctAnswer,
    required this.acceptedAnswers,
    required this.explanation,
    required this.unscoredReason,
  });

  factory ResultQuestion.fromJson(Json json) => ResultQuestion(
    index: json['index'] as int,
    prompt: json['prompt'] as String?,
    outcome: ResultOutcome.fromWire(json['outcome'] as String?),
    response: json['response'] as String?,
    correctAnswer: json['correctAnswer'] as String?,
    acceptedAnswers: readStrings(json['acceptedAnswers']),
    explanation: json['explanation'] as String?,
    unscoredReason: json['unscoredReason'] == null ? null : UnscoredReason.fromWire(json['unscoredReason'] as String?),
  );

  final int index;
  final String? prompt;
  final ResultOutcome outcome;
  final String? response;
  final String? correctAnswer;
  final List<String> acceptedAnswers;
  final String? explanation;
  final UnscoredReason? unscoredReason;
}

class ObjectiveResult {
  const ObjectiveResult({
    required this.scoreCorrect,
    required this.scoreTotal,
    required this.unscoredCount,
    required this.timeSpentSeconds,
    required this.questions,
  });

  factory ObjectiveResult.fromJson(Json json) => ObjectiveResult(
    scoreCorrect: json['scoreCorrect'] as int,
    scoreTotal: json['scoreTotal'] as int,
    unscoredCount: json['unscoredCount'] as int,
    timeSpentSeconds: readInt(json['timeSpentSeconds']),
    questions: readList(json['questions'], ResultQuestion.fromJson),
  );

  final int scoreCorrect;
  final int scoreTotal;
  final int unscoredCount;
  final int? timeSpentSeconds;
  final List<ResultQuestion> questions;
}

class ObjectiveView {
  const ObjectiveView({required this.runnable, required this.item, required this.attempt, required this.result});

  factory ObjectiveView.fromJson(Json json) => ObjectiveView(
    runnable: json['runnable'] as bool,
    item: ObjectiveItem.fromJson(json['item'] as Json),
    attempt: readObject(json['attempt'], ObjectiveAttempt.fromJson),
    result: readObject(json['result'], ObjectiveResult.fromJson),
  );

  final bool runnable;
  final ObjectiveItem item;
  final ObjectiveAttempt? attempt;
  final ObjectiveResult? result;

  ObjectiveAttempt? get openAttempt => attempt != null && !attempt!.submitted ? attempt : null;
}

class ActivityContext {
  const ActivityContext({
    required this.id,
    required this.lineage,
    required this.readOnly,
    required this.kind,
    required this.title,
    required this.state,
    required this.skipReason,
    required this.rating,
    required this.notUseful,
  });

  factory ActivityContext.fromJson(Json json) => ActivityContext(
    id: json['id'] as String,
    lineage: readStrings(json['lineage']),
    readOnly: json['readOnly'] as bool,
    kind: PlanActivityKind.fromWire(json['kind'] as String),
    title: json['title'] as String,
    state: PlanActivityState.fromWire(json['state'] as String),
    skipReason: json['skipReason'] as String?,
    rating: DifficultyRating.fromWire(json['rating'] as String?),
    notUseful: json['notUseful'] as bool? ?? false,
  );

  final String id;
  final List<String> lineage;
  final bool readOnly;
  final PlanActivityKind kind;
  final String title;
  final PlanActivityState state;
  final String? skipReason;
  final DifficultyRating? rating;
  final bool notUseful;
}

class ActivitySession {
  const ActivitySession({required this.position, required this.count, required this.activities});

  factory ActivitySession.fromJson(Json json) => ActivitySession(
    position: json['position'] as int,
    count: json['count'] as int,
    activities: readList(json['activities'], PlanActivityView.fromJson),
  );

  final int position;
  final int count;
  final List<PlanActivityView> activities;
}

class ActivityView {
  const ActivityView({required this.activity, required this.session, required this.objective});

  factory ActivityView.fromJson(Json json) => ActivityView(
    activity: ActivityContext.fromJson(json['activity'] as Json),
    session: ActivitySession.fromJson(json['session'] as Json),
    objective: readObject(json['objective'], ObjectiveView.fromJson),
  );

  final ActivityContext activity;
  final ActivitySession session;
  final ObjectiveView? objective;
}
