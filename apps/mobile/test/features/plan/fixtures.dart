/// Shared wire fixtures for the plan feature's tests.
library;

Map<String, dynamic> activityJson({
  String id = 'a1',
  int day = 1,
  String kind = 'listening',
  String state = 'pending',
  bool carriedOver = false,
  bool isReview = false,
  String? rating,
}) => {
  'id': id,
  'day': day,
  'position': 1,
  'kind': kind,
  'contentItemId': 'c1',
  'title': 'Listen: Ordering coffee',
  'estimatedMinutes': 6,
  'targetTags': [
    {'tag': 'grammar:present_perfect', 'label': 'Present perfect'},
  ],
  'rationale': 'Because listening is due.',
  'isReview': isReview,
  'carriedOver': carriedOver,
  'state': state,
  'startedAt': null,
  'completedAt': null,
  'skippedAt': null,
  'skipReason': null,
  'rating': rating,
  'notUseful': false,
};

Map<String, dynamic> sessionJson({int day = 1, String state = 'not_started'}) => {
  'day': day,
  'estimatedMinutes': 17,
  'state': state,
  'completedAt': null,
  'summary': {'completed': 0, 'skipped': 0, 'correct': null, 'questions': null, 'timeSpentSeconds': null},
  'activities': [activityJson(day: day)],
};

Map<String, dynamic> planJson() => {
  'id': 'plan-1',
  'status': 'active',
  'origin': 'lesson',
  'lessonId': 'lesson-1',
  'lessonDate': '2026-09-20T10:00:00.000Z',
  'createdAt': '2026-09-20T10:00:00.000Z',
  'activatedAt': '2026-09-20T10:00:00.000Z',
  'archivedAt': null,
  'summaryLine': '7 sessions · 7 activities',
  'focusTags': [
    {'tag': 'grammar:present_perfect', 'label': 'Present perfect'},
  ],
  'notes': [
    {'code': 'general_material', 'text': 'Built from general C1 material.'},
  ],
  'progress': {'total': 7, 'completed': 0, 'skipped': 0, 'inProgress': 0, 'pending': 7, 'completionPercent': 0},
  'ratings': {'tooEasy': 0, 'justRight': 0, 'tooHard': 0, 'notUseful': 0},
  'sessions': [for (var day = 1; day <= 7; day++) sessionJson(day: day)],
};

Map<String, dynamic> currentJson({Object? plan, Object? preparing, Object? failure}) => {
  'serverTime': '2026-09-25T14:00:00.000Z',
  'plan': plan,
  'preparing': preparing,
  'failure': failure,
};

Map<String, dynamic> historyItemJson({
  String id = 'p1',
  String status = 'archived',
  int completedCount = 12,
  int activityCount = 19,
  int completionPercent = 63,
}) => {
  'id': id,
  'status': status,
  'origin': 'lesson',
  'lessonId': 'l1',
  'lessonDate': '2026-09-10T10:00:00.000Z',
  'createdAt': '2026-09-10T10:00:00.000Z',
  'activatedAt': '2026-09-10T10:00:00.000Z',
  'archivedAt': '2026-09-18T10:00:00.000Z',
  'summaryLine': '7 sessions · $activityCount activities',
  'activityCount': activityCount,
  'completedCount': completedCount,
  'skippedCount': 1,
  'completionPercent': completionPercent,
  'ratings': {'tooEasy': 1, 'justRight': 2, 'tooHard': 0, 'notUseful': 0},
};
