import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

/// JSON shaped exactly like `GET /profile` and its ledger routes, for the
/// model and page tests.
const serverTime = '2026-09-25T10:00:00.000Z';
const entryId = '2b7f0c1e-5d4a-4c3b-9a8e-1f2d3c4b5a60';
const lessonId = '9f1c4d7e-3b2a-4f51-9d0c-7a6b5e4c3d21';

Map<String, dynamic> competencyJson(
  String competency, {
  int? score = 70,
  int? delta = 2,
  int measurementCount = 4,
  bool warmingUp = false,
  String? trend = 'up',
  Map<String, dynamic>? subScores,
}) => {
  'competency': competency,
  'score': score,
  'delta': delta,
  'measurementCount': measurementCount,
  'warmingUp': warmingUp,
  'trend': trend,
  'lastMeasuredAt': '2026-09-20T18:00:00.000Z',
  'subScores': subScores,
};

Map<String, dynamic> entryJson({String state = 'new', String trend = 'rising'}) => {
  'id': entryId,
  'tag': 'grammar:conditional-3',
  'label': 'Third conditional',
  'family': 'grammar',
  'occurrenceCount': 6,
  'recentOccurrenceCount': 4,
  'firstSeenAt': '2026-09-02T18:00:00.000Z',
  'lastSeenAt': '2026-09-22T10:00:00.000Z',
  'state': state,
  'dueAt': null,
  'trend': trend,
  'retired': false,
};

Map<String, dynamic> profileJson({
  bool empty = false,
  List<Map<String, dynamic>>? weaknesses,
  List<String> notes = const [],
  int? prosody = 66,
}) => {
  'serverTime': serverTime,
  'updatedAt': '2026-09-24T19:12:04.000Z',
  'empty': empty,
  'competencies': [
    competencyJson('grammar', score: 68, delta: 3),
    competencyJson('vocabulary', score: 74, delta: -1, trend: 'flat'),
    competencyJson('fluency', score: 71, delta: 0, trend: 'flat'),
    competencyJson('interaction', score: 77, measurementCount: 2, warmingUp: true, trend: null),
    competencyJson('comprehension', score: 80, delta: 1, trend: 'flat'),
    competencyJson('pronunciation', score: 72, subScores: {'accuracy': 81, 'prosody': prosody}),
  ],
  'recurringWeaknesses': weaknesses ?? [entryJson()],
  'notes': notes,
};

Map<String, dynamic> detailJson() => {
  'serverTime': serverTime,
  'entry': entryJson(),
  'examples': [
    {
      'sourceKind': 'lesson',
      'lessonId': lessonId,
      'activityId': null,
      'occurredAt': '2026-09-22T10:00:00.000Z',
      'quote': 'if I would have known',
      'correction': 'if I had known',
      'exampleWords': <String>[],
      'instances': 1,
    },
    {
      'sourceKind': 'lesson',
      'lessonId': lessonId,
      'activityId': null,
      'occurredAt': '2026-09-22T10:00:00.000Z',
      'quote': null,
      'correction': null,
      'exampleWords': ['think', 'three'],
      'instances': 4,
    },
  ],
  'sources': [
    {'sourceKind': 'lesson', 'lessonId': lessonId, 'activityId': null, 'occurredAt': '2026-09-22T10:00:00.000Z', 'occurrences': 2},
  ],
};

typedef Responder = Future<ResponseBody> Function(RequestOptions options);

ResponseBody jsonBody(Object body, {int status = 200}) => ResponseBody.fromString(
  jsonEncode(body),
  status,
  headers: {
    Headers.contentTypeHeader: [Headers.jsonContentType],
  },
);

/// Answers each `METHOD /path` from a script; counts calls per key.
class ScriptedAdapter implements HttpClientAdapter {
  ScriptedAdapter(this.responders);

  final Map<String, Responder> responders;
  final Map<String, int> calls = {};

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) {
    final key = '${options.method} ${options.path}';
    calls[key] = (calls[key] ?? 0) + 1;
    final responder = responders[key];
    if (responder == null) throw StateError('No script for $key');
    return responder(options);
  }

  @override
  void close({bool force = false}) {}
}
