const activityId = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';
const otherActivityId = '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f';
const attemptId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
final fingerprint = 'f' * 64;

Map<String, Object?> planEntryJson({
  String id = activityId,
  int position = 1,
  String kind = 'reading',
  String state = 'pending',
  String title = 'The housing debate',
}) => {
  'id': id,
  'day': 2,
  'position': position,
  'kind': kind,
  'contentItemId': '9f1c4d7e-3b2a-4f51-9d0c-7a6b5e4c3d22',
  'title': title,
  'estimatedMinutes': 7,
  'targetTags': <Object?>[],
  'rationale': 'Because.',
  'isReview': false,
  'carriedOver': false,
  'state': state,
  'startedAt': null,
  'completedAt': null,
  'skippedAt': null,
  'skipReason': null,
  'rating': null,
  'notUseful': false,
};

/// Five questions: multiple choice, fill-in-the-blank, multiple choice, fill-in-the-blank, multiple choice.
List<Map<String, Object?>> fiveQuestionsJson() => [
  {'index': 0, 'format': 'multiple_choice', 'prompt': 'What does the writer blame?', 'options': ['Rates', 'The council', 'Builders', 'Policy']},
  {
    'index': 1,
    'format': 'fill_blank',
    'prompt': 'If the council ___ the tenants, it would survive.',
    'before': 'If the council ',
    'after': ' the tenants, it would survive.',
    'blankLength': 15,
  },
  {'index': 2, 'format': 'multiple_choice', 'prompt': 'Which tone?', 'options': ['Detached', 'Exasperated', 'Celebratory', 'Nostalgic']},
  {
    'index': 3,
    'format': 'fill_blank',
    'prompt': '___ the tenants been heard, it would differ.',
    'before': '',
    'after': ' the tenants been heard, it would differ.',
    'blankLength': 4,
  },
  {'index': 4, 'format': 'multiple_choice', 'prompt': 'Which title?', 'options': ['A', 'B', 'C', 'D']},
];

Map<String, Object?> resultJson() => {
  'scoreCorrect': 3,
  'scoreTotal': 4,
  'unscoredCount': 1,
  'timeSpentSeconds': 120,
  'submittedAt': '2026-10-02T07:44:44.000Z',
  'questions': [
    {
      'index': 0,
      'format': 'multiple_choice',
      'prompt': 'What does the writer blame?',
      'outcome': 'correct',
      'response': 'The council',
      'correctAnswer': 'The council',
      'acceptedAnswers': <Object?>[],
      'explanation': 'Paragraph two.',
      'unscoredReason': null,
    },
    {
      'index': 1,
      'format': 'fill_blank',
      'prompt': 'If the council ___ the tenants, it would survive.',
      'outcome': 'incorrect',
      'response': 'would have heard',
      'correctAnswer': 'had listened to',
      'acceptedAnswers': ['had listened to', 'had heard'],
      'explanation': 'A third conditional puts the past perfect in the if-clause.',
      'unscoredReason': null,
    },
    {
      'index': 4,
      'format': 'unscored',
      'prompt': 'Put these in order.',
      'outcome': 'unscored',
      'response': null,
      'correctAnswer': null,
      'acceptedAnswers': <Object?>[],
      'explanation': null,
      'unscoredReason': 'format_unavailable',
    },
  ],
};

Map<String, Object?> openAttemptJson([String id = attemptId]) => {
  'id': id,
  'status': 'open',
  'startedAt': '2026-10-02T07:38:02.000Z',
  'submittedAt': null,
};

Map<String, Object?> viewJson({
  String kind = 'reading',
  String state = 'pending',
  bool readOnly = false,
  Object? attempt,
  Object? result,
  String? fingerprintOverride,
  List<Map<String, Object?>>? questions,
  Object? passage = _defaultPassage,
  bool hasAudio = false,
  bool runnable = true,
  List<Map<String, Object?>>? session,
  String? skipReason,
}) {
  final entries =
      session ??
      [
        planEntryJson(kind: kind, state: state),
        planEntryJson(id: otherActivityId, position: 2, kind: 'grammar', title: 'Regrets'),
      ];
  return {
    'serverTime': '2026-10-02T07:41:10.000Z',
    'activity': {
      'id': activityId,
      'lineage': [activityId],
      'planId': '4f1c2b3a-5d6e-4f70-8a91-b2c3d4e5f607',
      'planStatus': readOnly ? 'archived' : 'active',
      'readOnly': readOnly,
      'kind': kind,
      'title': 'The housing debate',
      'estimatedMinutes': 7,
      'targetTags': <Object?>[],
      'rationale': 'Because.',
      'state': state,
      'startedAt': null,
      'completedAt': null,
      'skippedAt': null,
      'skipReason': skipReason,
      'rating': null,
      'notUseful': false,
      'planCompletionPercent': 21,
    },
    'session': {'day': 2, 'position': 1, 'count': entries.length, 'activities': entries},
    'objective': {
      'runnable': runnable,
      'item': {
        'type': kind,
        'title': 'The housing debate',
        'topic': 'housing',
        'cefrLevel': 'C1',
        'accent': null,
        'durationSeconds': null,
        'passage': identical(passage, _defaultPassage)
            ? {'kind': 'text', 'text': 'Had the council listened to its tenants, the scheme would not have collapsed.'}
            : passage,
        'hasAudio': hasAudio,
        'source': null,
        'questionsFingerprint': fingerprintOverride ?? fingerprint,
        'questions': questions ?? fiveQuestionsJson(),
      },
      'attempt': attempt,
      'result': result,
    },
  };
}

Map<String, Object?> submittedViewJson({List<Map<String, Object?>>? session}) => viewJson(
  state: 'completed',
  attempt: {'id': attemptId, 'status': 'submitted', 'startedAt': '2026-10-02T07:38:02.000Z', 'submittedAt': '2026-10-02T07:44:44.000Z'},
  result: resultJson(),
  session: session,
);

const Object _defaultPassage = Object();
