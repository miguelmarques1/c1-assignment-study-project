import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/lessons/models/transcript_models.dart';
import 'package:mobile/features/plan/plan_models.dart';
import 'package:mobile/features/speaking/speaking_models.dart';

void main() {
  test('parses_a_scored_read_aloud_activity', () {
    final view = SpeakingActivityView.fromJson({
      'activityId': '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d',
      'kind': 'pronunciation',
      'title': 'Read aloud: /θ/ as in "think"',
      'state': 'completed',
      'planStatus': 'active',
      'estimatedMinutes': 4,
      'targetTags': [
        {'tag': 'phoneme:/θ/', 'label': '/θ/ as in "think"'},
      ],
      'task': {
        'shape': 'read_aloud',
        'referenceText': 'Nothing in the southern valley was thought through.',
        'prompt': null,
        'hint': null,
        'wordCount': 9,
        'focusTags': [
          {'tag': 'phoneme:/θ/', 'label': '/θ/ as in "think"'},
        ],
        'targetSeconds': null,
      },
      'block': null,
      'limits': {'maxAttempts': 3, 'maxRecordingSeconds': 120, 'minRecognizedWords': 10},
      'attemptsUsed': 1,
      'attemptsRemaining': 2,
      'bestAttemptId': '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f',
      'attempts': [
        {
          'id': '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f',
          'clientAttemptId': '0f1e2d3c-4b5a-4968-8776-655443322110',
          'ordinal': 1,
          'state': 'scored',
          'createdAt': '2026-10-02T07:31:12.000Z',
          'scoredAt': '2026-10-02T07:31:16.000Z',
          'durationMs': 22480,
          'isBest': true,
          'failure': null,
          'result': {
            'scores': {'pronunciation': 71.6, 'accuracy': 74.2, 'fluency': 80.1, 'prosody': 66.5, 'completeness': 97.9},
            'recognizedWordCount': 9,
            'transcript': null,
            'words': [
              {'text': 'Nothing', 'band': 'poor', 'accuracy': 48, 'errorTypes': ['Mispronunciation'], 'startMs': 640, 'durationMs': 410},
              {'text': 'in', 'band': 'good', 'accuracy': 96, 'errorTypes': <String>[], 'startMs': 1050, 'durationMs': 120},
              {'text': 'the', 'band': 'poor', 'accuracy': 0, 'errorTypes': ['Omission'], 'startMs': null, 'durationMs': null},
            ],
            'failingPhonemes': [
              {
                'tag': 'phoneme:/θ/',
                'label': '/θ/ as in "think"',
                'meanAccuracy': 44.0,
                'instances': 5,
                'exampleWord': 'nothing',
                'exampleStartMs': 640,
                'exampleDurationMs': 410,
              },
            ],
          },
        },
      ],
      'rating': null,
    });

    expect(view.kind, SpeakingActivityKind.pronunciation);
    expect(view.state, PlanActivityState.completed);
    expect(view.block, isNull);
    expect(view.task!.shape, SpeakingShape.readAloud);
    expect(view.task!.focusTags.single.label, '/θ/ as in "think"');
    expect(view.attempts, hasLength(1));

    final attempt = view.attempts.single;
    expect(attempt.state, SpeakingAttemptState.scored);
    expect(attempt.isBest, isTrue);
    final result = attempt.result!;
    expect(result.scores.pronunciation, 71.6);
    expect(result.scores.prosody, 66.5);
    expect(result.words[0].band, WordBand.poor);
    expect(result.words[1].band, WordBand.good);
    expect(result.words[2].band, WordBand.poor);
    expect(result.words[2].startMs, isNull);
    expect(result.failingPhonemes.single.exampleWord, 'nothing');
  });

  test('a_null_band_renders_as_not_assessed', () {
    final word = SpeakingWord.fromJson({
      'text': 'extra',
      'band': null,
      'accuracy': null,
      'errorTypes': <String>[],
      'startMs': null,
      'durationMs': null,
    });

    expect(word.band, isNull);
    expect(word.spokenLabel, 'extra: not assessed');
  });

  test('a_server_block_takes_priority_order_from_the_wire_value', () {
    expect(SpeakingBlock.fromWire('azure_key_missing'), SpeakingBlock.azureKeyMissing);
    expect(SpeakingBlock.fromWire('plan_archived'), SpeakingBlock.planArchived);
    expect(SpeakingBlock.fromWire('activity_skipped'), SpeakingBlock.activitySkipped);
    expect(SpeakingBlock.fromWire(null), isNull);
  });

  test('a_failed_attempt_carries_its_sentence_and_rescorable_flag', () {
    final attempt = SpeakingAttemptView.fromJson({
      'id': 'a1',
      'clientAttemptId': 'c1',
      'ordinal': null,
      'state': 'failed',
      'createdAt': '2026-10-02T07:31:12.000Z',
      'scoredAt': null,
      'durationMs': 5000,
      'isBest': false,
      'failure': {'code': 'service_error', 'message': 'Scoring failed. Your recording is saved — re-score when ready.', 'rescorable': true},
      'result': null,
    });

    expect(attempt.failure!.code, SpeakingFailureCode.serviceError);
    expect(attempt.failure!.rescorable, isTrue);
    expect(attempt.result, isNull);
  });

  test('rating_input_serializes_too_hard_and_not_useful', () {
    const input = SpeakingRatingInput(rating: DifficultyRating.tooHard, notUseful: true);

    expect(input.toJson(), {'rating': 'too_hard', 'notUseful': true});
  });

  test('rating_input_serializes_a_null_rating', () {
    const input = SpeakingRatingInput(rating: null, notUseful: false);

    expect(input.toJson(), {'rating': null, 'notUseful': false});
  });

  test('copyWithRating_replaces_only_the_rating', () {
    final view = SpeakingActivityView.fromJson({
      'activityId': 'a1',
      'kind': 'speaking',
      'title': 'Talk about your weekend',
      'state': 'pending',
      'planStatus': 'active',
      'estimatedMinutes': 6,
      'targetTags': <Map<String, Object?>>[],
      'task': null,
      'block': 'plan_archived',
      'limits': {'maxAttempts': 3, 'maxRecordingSeconds': 120, 'minRecognizedWords': 10},
      'attemptsUsed': 0,
      'attemptsRemaining': 3,
      'bestAttemptId': null,
      'attempts': <Map<String, Object?>>[],
      'rating': null,
    });

    final updated = view.copyWithRating(const SpeakingRatingView(rating: DifficultyRating.justRight, notUseful: false));

    expect(updated.rating!.rating, DifficultyRating.justRight);
    expect(updated.activityId, view.activityId);
    expect(updated.block, SpeakingBlock.planArchived);
  });
}
