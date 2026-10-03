import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/writing/writing_models.dart';

Map<String, dynamic> _correctedViewJson() => {
  'activityId': '11111111-1111-4111-8111-111111111111',
  'taskId': '22222222-2222-4222-8222-222222222222',
  'planId': '33333333-3333-4333-8333-333333333333',
  'activityState': 'completed',
  'readOnly': false,
  'title': 'Writing: Third conditional',
  'task': {
    'heading': 'Letter to the editor',
    'statement': 'Write a letter to the editor about the riverside park.',
    'targetTags': [
      {'tag': 'grammar:conditional-3', 'label': 'Third conditional'},
    ],
  },
  'status': 'corrected',
  'draft': {'text': 'I goed to the park.', 'revision': 4, 'savedAt': '2026-10-02T08:00:00.000Z'},
  'submittedAt': '2026-10-02T08:10:00.000Z',
  'failure': null,
  'correction': {
    'correctedAt': '2026-10-02T08:10:30.000Z',
    'overallComment': 'A clear letter with good structure.',
    'scores': [
      {'dimension': 'grammar', 'label': 'Grammar', 'score': 70},
      {'dimension': 'vocabulary', 'label': 'Vocabulary', 'score': 80},
      {'dimension': 'coherence', 'label': 'Coherence', 'score': 90},
      {'dimension': 'task_achievement', 'label': 'Task achievement', 'score': 60},
    ],
    'text': [
      {'text': 'I ', 'errorIndexes': []},
      {
        'text': 'goed',
        'errorIndexes': [0],
      },
      {'text': ' to the park.', 'errorIndexes': []},
    ],
    'revision': [
      {'text': 'I ', 'changed': false},
      {'text': 'went', 'changed': true},
      {'text': ' to the park.', 'changed': false},
    ],
    'errors': [
      {
        'index': 0,
        'quote': 'goed',
        'tag': 'grammar:past-simple',
        'tagLabel': 'Past simple',
        'correction': 'went',
        'correctionSegments': [
          {'text': 'went', 'changed': true},
        ],
        'explanation': 'The past tense of "go" is irregular.',
      },
    ],
    'errorGroups': [
      {
        'tag': 'grammar:past-simple',
        'tagLabel': 'Past simple',
        'errorIndexes': [0],
        'recurrence': {'count': 3, 'label': '3rd time'},
      },
    ],
  },
  'submission': {
    'geminiKeyUsable': true,
    'dailyLimit': {'max': 10, 'used': 3, 'resetsAt': null},
  },
  'serverTime': '2026-10-02T08:42:03.000Z',
};

void main() {
  group('WritingActivityView', () {
    test('parses_the_corrected_view_fixture', () {
      final view = WritingActivityView.fromJson(_correctedViewJson());

      expect(view.activityId, '11111111-1111-4111-8111-111111111111');
      expect(view.status, WritingTaskStatus.corrected);
      expect(view.task.targetTags.single.label, 'Third conditional');
      expect(view.draft.revision, 4);
      expect(view.submittedAt, DateTime.parse('2026-10-02T08:10:00.000Z'));

      final correction = view.correction!;
      expect(correction.overallComment, 'A clear letter with good structure.');
      expect(correction.scores.map((s) => s.dimension), [
        WritingScoreDimension.grammar,
        WritingScoreDimension.vocabulary,
        WritingScoreDimension.coherence,
        WritingScoreDimension.taskAchievement,
      ]);
      expect(correction.text[1].errorIndexes, [0]);
      expect(correction.revision[1].changed, isTrue);
      expect(correction.errors.single.quote, 'goed');
      expect(correction.errors.single.correctionSegments.single.text, 'went');
      expect(correction.errorGroups.single.recurrence!.label, '3rd time');
      expect(view.submission.dailyLimit.max, 10);
    });

    test('an_unknown_enum_value_falls_back_instead_of_crashing', () {
      final json = _correctedViewJson();
      json['status'] = 'some_future_status';
      (json['correction'] as Map<String, dynamic>)['scores'] = [
        {'dimension': 'some_future_dimension', 'label': 'Mystery', 'score': 50},
      ];

      final view = WritingActivityView.fromJson(json);

      expect(view.status, WritingTaskStatus.draft);
      expect(view.correction!.scores.single.dimension, WritingScoreDimension.grammar);
    });

    test('a_null_failure_and_correction_parse_as_null', () {
      final json = _correctedViewJson();
      json['correction'] = null;
      json['failure'] = {'code': 'gemini_key', 'message': 'Add your Gemini key to have your writing corrected.'};

      final view = WritingActivityView.fromJson(json);

      expect(view.correction, isNull);
      expect(view.failure!.code, WritingFailureCode.geminiKey);
    });
  });
}
