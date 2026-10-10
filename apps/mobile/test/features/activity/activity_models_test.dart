import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/activity/activity_models.dart';
import 'package:mobile/features/plan/plan_models.dart';

import 'activity_fixtures.dart';

void main() {
  test('parses_a_reading_view_with_every_question_format', () {
    final json = viewJson(
      state: 'in_progress',
      attempt: openAttemptJson(),
      questions: [
        ...fiveQuestionsJson().take(4),
        {'index': 4, 'format': 'unscored', 'prompt': 'Put these in order.', 'reason': 'format_unavailable'},
      ],
    );

    final view = ActivityView.fromJson(json);

    expect(view.activity.kind, PlanActivityKind.reading);
    expect(view.activity.state, PlanActivityState.inProgress);
    expect(view.session.count, 2);
    expect(view.session.activities.first.id, activityId);
    final objective = view.objective!;
    expect(objective.runnable, isTrue);
    expect(objective.openAttempt!.id, attemptId);
    expect(objective.item.passage!.heading, 'Text');
    final questions = objective.item.questions;
    expect(questions[0], isA<MultipleChoiceQuestion>());
    expect((questions[0] as MultipleChoiceQuestion).options, hasLength(4));
    expect((questions[1] as FillBlankQuestion).blankLength, 15);
    expect((questions[4] as UnscoredQuestion).reason, UnscoredReason.formatUnavailable);
  });

  test('an_unknown_question_format_becomes_an_unscored_question', () {
    final question = ObjectiveQuestion.fromJson({'index': 2, 'format': 'hologram', 'prompt': null});
    expect(question, isA<UnscoredQuestion>());
    expect(question.isScored, isFalse);
  });

  test('parses_a_result_with_corrections_and_unscored_questions', () {
    final view = ActivityView.fromJson(submittedViewJson());
    final result = view.objective!.result!;

    expect(result.scoreCorrect, 3);
    expect(result.scoreTotal, 4);
    expect(result.unscoredCount, 1);
    expect(result.questions[1].outcome, ResultOutcome.incorrect);
    expect(result.questions[1].acceptedAnswers, ['had listened to', 'had heard']);
    expect(result.questions[2].unscoredReason, UnscoredReason.formatUnavailable);
    expect(view.objective!.attempt!.submitted, isTrue);
    expect(view.objective!.openAttempt, isNull);
  });

  test('a_listening_transcript_is_marked_as_one', () {
    final view = ActivityView.fromJson(viewJson(kind: 'listening', passage: {'kind': 'transcript', 'text': 'Presenter: tonight'}, hasAudio: true));
    expect(view.objective!.item.passage!.isTranscript, isTrue);
    expect(view.objective!.item.passage!.heading, 'Transcript');
    expect(view.objective!.item.hasAudio, isTrue);
  });

  test('answers_round_trip_through_json', () {
    const choice = ObjectiveAnswer.choice(index: 0, optionIndex: 2);
    const text = ObjectiveAnswer.text(index: 1, text: 'had heard');

    expect(choice.toJson(), {'index': 0, 'format': 'multiple_choice', 'optionIndex': 2});
    expect(ObjectiveAnswer.tryFromJson(text.toJson())!.text, 'had heard');
    expect(ObjectiveAnswer.tryFromJson({'index': 0, 'format': 'nope'}), isNull);
  });

  test('rating_wire_values_match_the_api', () {
    expect(ratingWire(DifficultyRating.tooEasy), 'too_easy');
    expect(ratingWire(DifficultyRating.justRight), 'just_right');
    expect(ratingWire(DifficultyRating.tooHard), 'too_hard');
  });
}
