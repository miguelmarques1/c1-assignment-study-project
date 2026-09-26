/// JSON exactly as the API returns each view F19's mobile screens compose —
/// the same data as the web's `test/fixtures/lessons.ts`.
library;

const lessonId = '9f1c4d7e-3b2a-4f51-9d0c-7a6b5e4c3d21';
const me = '3f8b1a20-5c6d-4e7f-8a91-2b3c4d5e6f70';
const ana = 'b21e9a44-7f30-4c18-9e55-1d2c3b4a5e6f';
const u1 = '11111111-1111-4111-8111-111111111111';
const u2 = '22222222-2222-4222-8222-222222222222';
const u3 = '33333333-3333-4333-8333-333333333333';

Map<String, dynamic> summaryJson({
  String id = lessonId,
  String status = 'ready',
  List<String> flags = const [],
  String? activeStage,
  String? statusReason,
  String? headline = 'Grammar +4 · Pronunciation −2',
  String? title = 'The missed connection',
  String startedAt = '2026-09-24T14:10:03.000Z',
}) => {
  'lessonId': id,
  'startedAt': startedAt,
  'endedAt': '2026-09-24T15:02:41.000Z',
  'durationSeconds': 3158,
  'participants': [
    {'userId': me, 'displayName': 'Miguel', 'isMe': true},
    {'userId': ana, 'displayName': 'Ana', 'isMe': false},
  ],
  'scenarioTitle': title,
  'vocabularyDomain': 'travel',
  'status': status,
  'flags': flags,
  'activeStage': activeStage,
  'statusReason': statusReason,
  'headline': status == 'ready' ? headline : null,
  'storageBytes': 48213504,
};

Map<String, dynamic> listJson(List<Map<String, dynamic>> lessons, {String? nextCursor}) => {
  'lessons': lessons,
  'nextCursor': nextCursor,
  'totalStorageBytes': 13002342,
};

Map<String, dynamic> detailJson({String status = 'ready', String? statusReason}) => {
  ...summaryJson(status: status, statusReason: statusReason),
  'scenario': {'status': 'ready', 'myCardStatus': 'ready'},
  'others': [
    {
      'userId': ana,
      'displayName': 'Ana',
      'stages': [
        {'stage': 'recording', 'state': 'completed', 'startedAt': '2026-09-24T14:10:03.000Z', 'finishedAt': '2026-09-24T15:03:30.000Z'},
        {'stage': 'transcription', 'state': 'completed', 'startedAt': '2026-09-24T15:03:31.000Z', 'finishedAt': '2026-09-24T15:06:12.000Z'},
        {'stage': 'excerpt_selection', 'state': 'completed', 'startedAt': '2026-09-24T15:06:12.000Z', 'finishedAt': '2026-09-24T15:06:13.000Z'},
        {'stage': 'pronunciation_assessment', 'state': 'pending', 'startedAt': null, 'finishedAt': null},
        {'stage': 'lesson_analysis', 'state': 'not_started', 'startedAt': null, 'finishedAt': null},
        {'stage': 'profile_update', 'state': 'not_started', 'startedAt': null, 'finishedAt': null},
      ],
    },
  ],
};

Map<String, dynamic> analysisJson() => {
  'lessonId': lessonId,
  'status': 'ready',
  'analysis': {
    'competencies': [
      {'competency': 'grammar', 'score': 72, 'justification': 'Mostly accurate tenses.', 'delta': 4},
      {'competency': 'vocabulary', 'score': 68, 'justification': 'Some range.', 'delta': -2},
      {'competency': 'fluency', 'score': 70, 'justification': 'Steady pace.', 'delta': 0},
      {'competency': 'interaction', 'score': 75, 'justification': 'Good turn-taking.', 'delta': null},
      {'competency': 'comprehension', 'score': 80, 'justification': 'Followed well.', 'delta': 1},
    ],
    'strengths': ['Clear turn-taking', 'Good follow-up questions', 'Steady pace'],
    'errors': [
      {
        'quote': 'if I would have known, I would have booked earlier',
        'correction': 'if I had known, I would have booked earlier',
        'correctionSegments': [
          {'text': 'if I', 'changed': false},
          {'text': 'had', 'changed': true},
          {'text': 'known, I would have booked earlier', 'changed': false},
        ],
        'explanation': 'The third conditional takes the past perfect after "if".',
        'severity': 'major',
        'tag': 'grammar:conditional-3',
        'tagLabel': 'Third conditional',
        'recurring': true,
        'recurrence': {'count': 4, 'label': '4th time'},
        'utteranceId': u1,
      },
      {
        'quote': 'I have went there yesterday',
        'correction': 'I went there yesterday',
        'correctionSegments': [
          {'text': 'I went there yesterday', 'changed': false},
        ],
        'explanation': 'Use the past simple with a finished time.',
        'severity': 'minor',
        'tag': 'grammar:present-perfect',
        'tagLabel': 'Present perfect',
        'recurring': false,
        'recurrence': null,
        'utteranceId': u3,
      },
    ],
    'recurringTags': ['grammar:conditional-3'],
    'scenarioContext': 'full',
    'scenarioFit': {
      'roleLabel': 'The Traveler',
      'registerExpected': 'neutral',
      'registerMatched': true,
      'registerComment': 'Polite without being stiff.',
      'expressionsUsed': ['to be on the safe side'],
      'expressionsNotUsed': ['with all due respect', 'the bottom line is'],
    },
    'topicsToPractice': ['Conditionals', 'Collocations', 'Hedging'],
    'notes': <String>[],
    'analyzedAt': '2026-09-24T15:20:00.000Z',
  },
};

Map<String, dynamic> _excerptPronunciation(double score, {double? prosody = 66.8}) => {
  'status': 'assessed',
  'scores': {'pronunciation': score, 'accuracy': 74.5, 'fluency': 70.2, 'prosody': prosody, 'completeness': 100},
};

Map<String, dynamic> pronunciationJson() => {
  'lessonId': lessonId,
  'status': 'assessed',
  'result': {
    'scores': {'pronunciation': 77.6, 'accuracy': 74.5, 'fluency': 70.2, 'prosody': null, 'completeness': 100},
    'overall': {'score': 78, 'delta': -2},
    'excerptCount': 2,
    'assessedCount': 2,
    'partialAssessment': false,
    'sparsePronunciationSample': true,
    'quotaExhausted': false,
    'notes': ['Based on only 2 excerpts — this score is less reliable than usual.'],
    'worstPhonemes': [
      {'phoneme': '/θ/', 'meanAccuracy': 41.2, 'occurrences': 3, 'exampleWord': 'think', 'exampleUtteranceId': u1},
    ],
    'worstWords': [
      {'word': 'postponed', 'meanAccuracy': 54.4, 'occurrences': 2, 'errorTypes': ['Mispronunciation'], 'exampleUtteranceId': u3},
    ],
  },
  'excerpts': [
    {
      'excerptId': 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1',
      'utteranceId': u1,
      'rank': 1,
      'referenceText': 'if I would have known, I would have booked earlier',
      'durationMs': 5000,
      'pronunciation': _excerptPronunciation(71.4),
    },
    {
      'excerptId': 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2',
      'utteranceId': u3,
      'rank': 2,
      'referenceText': 'I have went there yesterday',
      'durationMs': 4000,
      'pronunciation': _excerptPronunciation(84.6, prosody: null),
    },
  ],
};

Map<String, dynamic> transcriptJson() {
  final excerpts = (pronunciationJson()['excerpts'] as List).cast<Map<String, dynamic>>();
  return {
    'lessonId': lessonId,
    'lessonStartedAt': '2026-09-24T14:10:03.000Z',
    'speakers': [
      {'userId': me, 'displayName': 'Miguel', 'isMe': true, 'status': 'available'},
      {'userId': ana, 'displayName': 'Ana', 'isMe': false, 'status': 'pending'},
    ],
    'myExcerptSelection': null,
    'utterances': [
      {
        'id': u1,
        'userId': me,
        'startMs': 5000,
        'endMs': 10000,
        'text': 'if I would have known, I would have booked earlier',
        'confidence': 0.62,
        'words': <Object>[],
        'excerpt': {
          'rank': 1,
          'reason': 'Selected: recognition confidence 0.62, 10 words',
          'confidence': 0.62,
          'wordCount': 10,
          'durationMs': 5000,
          'focusWordCount': 0,
          'ruleVersion': '1',
          'pronunciation': excerpts[0]['pronunciation'],
          'assessedWords': [
            {'text': 'known', 'accuracy': 54, 'errorTypes': ['Mispronunciation'], 'band': 'poor'},
            {'text': 'booked', 'accuracy': 71, 'errorTypes': <String>[], 'band': 'fair'},
            {'text': 'earlier', 'accuracy': 93, 'errorTypes': <String>[], 'band': 'good'},
          ],
        },
      },
      {'id': u2, 'userId': ana, 'startMs': 12000, 'endMs': 15000, 'text': 'That makes sense.'},
      {
        'id': u3,
        'userId': me,
        'startMs': 247000,
        'endMs': 251000,
        'text': 'I have went there yesterday',
        'excerpt': {
          'rank': 2,
          'reason': 'Selected: recognition confidence 0.70, 5 words',
          'confidence': 0.7,
          'wordCount': 5,
          'durationMs': 4000,
          'focusWordCount': 0,
          'ruleVersion': '1',
          'pronunciation': excerpts[1]['pronunciation'],
          'assessedWords': [
            {'text': 'went', 'accuracy': 86, 'errorTypes': <String>[], 'band': 'good'},
          ],
        },
      },
    ],
  };
}

Map<String, dynamic> scenarioJson() => {
  'lessonId': lessonId,
  'status': 'ready',
  'situation': {
    'title': 'The missed connection',
    'setting': 'A rebooking desk at a busy European hub after a cancelled flight.',
    'premise': 'Only one seat is left on the evening flight, and two travellers need it.',
    'roles': [
      {'label': 'The Traveler', 'relationship': 'Needs the last seat to reach a job interview'},
      {'label': 'Airline agent', 'relationship': "Must apply the airline's priority rules"},
    ],
    'vocabularyDomain': 'travel',
    'discussionHooks': ['Who deserves priority?', 'What compensation is fair?', 'What alternatives exist?'],
  },
  'myRoleLabel': 'The Traveler',
  'myCard': {
    'status': 'ready',
    'background': 'You are flying to Lisbon for a final-round interview tomorrow morning.',
    'objective': 'Get the last seat without revealing the interview is optional.',
    'constraint': 'You already declined a voucher earlier today.',
    'register': 'neutral',
    'targetExpressions': ['to be on the safe side', 'with all due respect', 'the bottom line is'],
  },
};

Map<String, dynamic> _stage(String stage, String status, {Map<String, dynamic> extra = const {}}) => {
  'stage': stage,
  'status': status,
  'startedAt': '2026-09-24T15:03:31.000Z',
  'finishedAt': status == 'completed' || status == 'failed' ? '2026-09-24T15:04:35.000Z' : null,
  'lastAttemptAt': '2026-09-24T15:03:31.000Z',
  'nextAttemptAt': null,
  'attempts': 1,
  'reasonCode': null,
  'reason': null,
  'providerMessage': null,
  'blockedProvider': null,
  'retryable': false,
  'progress': null,
  ...extra,
};

Map<String, dynamic> pipelineJson({String? unknownStage}) => {
  'lessonId': lessonId,
  'serverTime': '2026-09-24T15:10:00.000Z',
  'branch': {
    'stage': 'lesson_analysis',
    'status': 'failed',
    'stages': [
      _stage('recording', 'completed'),
      _stage('transcription', 'blocked_missing_key', extra: {
        'reasonCode': 'credential_missing',
        'reason': 'Blocked — add your Azure Speech key to continue.',
        'blockedProvider': 'azure_speech',
      }),
      _stage('pronunciation_assessment', 'running', extra: {
        'startedAt': '2026-09-24T15:09:00.000Z',
        'progress': {'done': 4, 'total': 12},
      }),
      _stage('lesson_analysis', 'failed', extra: {
        'reasonCode': 'analysis_invalid_output',
        'reason': 'The analysis came back malformed twice.',
        'providerMessage': 'Schema validation failed at /errors/3',
        'retryable': true,
      }),
      if (unknownStage != null) _stage(unknownStage, 'queued'),
    ],
  },
};

Map<String, dynamic> recordingJson({String myStatus = 'partial', int capturedSeconds = 42 * 60}) => {
  'lessonId': lessonId,
  'lessonStatus': 'ended',
  'endReason': 'ended_by_participant',
  'startedAt': '2026-09-24T14:10:03.000Z',
  'endedAt': '2026-09-24T15:02:41.000Z',
  'durationSeconds': 3158,
  'recordingStatus': 'recording_partial',
  'storageBytes': 48213504,
  'mine': {
    'recordingStatus': myStatus,
    'audioBytes': 24000000,
    'capturedSeconds': capturedSeconds,
    'audioDurationSeconds': 3158,
    'recordingStartedAt': '2026-09-24T14:10:03.000Z',
    'branch': null,
  },
};
