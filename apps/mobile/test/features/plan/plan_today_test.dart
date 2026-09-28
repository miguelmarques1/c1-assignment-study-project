import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/plan/plan_models.dart';
import 'package:mobile/features/plan/plan_today.dart';

PlanSessionView session(
  int day, {
  PlanSessionState state = PlanSessionState.notStarted,
  DateTime? completedAt,
}) {
  return PlanSessionView(
    day: day,
    estimatedMinutes: 17,
    state: state,
    completedAt: completedAt,
    summary: const PlanSessionSummary(completed: 0, skipped: 0, correct: null, questions: null, timeSpentSeconds: null),
    activities: const [],
  );
}

StudyPlanView plan(List<PlanSessionView> sessions) {
  return StudyPlanView(
    id: 'plan-1',
    status: StudyPlanStatus.active,
    origin: StudyPlanOrigin.lesson,
    lessonId: 'lesson-1',
    lessonDate: DateTime.parse('2026-09-20T10:00:00.000Z'),
    createdAt: DateTime.parse('2026-09-20T10:00:00.000Z'),
    activatedAt: DateTime.parse('2026-09-20T10:00:00.000Z'),
    archivedAt: null,
    summaryLine: '7 sessions · 0 activities',
    focusTags: const [],
    notes: const [],
    progress: const PlanProgress(total: 0, completed: 0, skipped: 0, inProgress: 0, pending: 0, completionPercent: 0),
    ratings: const PlanRatingCounts(tooEasy: 0, justRight: 0, tooHard: 0, notUseful: 0),
    sessions: sessions,
  );
}

/// The shared case table: `apps/web/test/plan-today.spec.ts` pins the same
/// rows, so the two clients pick the same session for `Today`. Built from
/// local date parts, so it holds in any time zone.
final now = DateTime(2026, 9, 25, 14);

void main() {
  group('selectTodaySession', () {
    test('an_in_progress_session_wins_over_everything_else', () {
      final p = plan([
        session(1, state: PlanSessionState.completed, completedAt: now),
        session(2, state: PlanSessionState.inProgress),
        session(3),
      ]);
      final result = selectTodaySession(p, now);
      expect(result.mode, TodayMode.inProgress);
      expect(result.session?.day, 2);
    });

    test('a_session_completed_today_stays_until_the_day_turns', () {
      final completedToday = DateTime(2026, 9, 25, 8);
      final p = plan([session(1, state: PlanSessionState.completed, completedAt: completedToday), session(2)]);
      final result = selectTodaySession(p, now);
      expect(result.mode, TodayMode.completedToday);
      expect(result.session?.day, 1);
    });

    test('picks_the_latest_of_several_sessions_completed_today', () {
      final morning = DateTime(2026, 9, 25, 8);
      final noon = DateTime(2026, 9, 25, 12);
      final p = plan([
        session(1, state: PlanSessionState.completed, completedAt: morning),
        session(2, state: PlanSessionState.completed, completedAt: noon),
        session(3),
      ]);
      final result = selectTodaySession(p, now);
      expect(result.session?.day, 2);
    });

    test('a_session_completed_yesterday_does_not_count_as_today', () {
      final yesterday = DateTime(2026, 9, 24, 20);
      final p = plan([session(1, state: PlanSessionState.completed, completedAt: yesterday), session(2)]);
      final result = selectTodaySession(p, now);
      expect(result.mode, TodayMode.next);
      expect(result.session?.day, 2);
    });

    test('the_next_untouched_session_follows_a_gap_without_skipping_ahead', () {
      final longAgo = DateTime(2026, 9, 1, 8);
      final p = plan([
        session(1, state: PlanSessionState.completed, completedAt: longAgo),
        session(2),
        session(3),
      ]);
      final result = selectTodaySession(p, now);
      expect(result.mode, TodayMode.next);
      expect(result.session?.day, 2);
    });

    test('a_finished_plan_reports_plan_complete', () {
      final done = DateTime(2026, 9, 1, 8);
      final p = plan([
        for (var day = 1; day <= 7; day++) session(day, state: PlanSessionState.completed, completedAt: done),
      ]);
      final result = selectTodaySession(p, now);
      expect(result.mode, TodayMode.planComplete);
      expect(result.session, isNull);
    });

    test('uses_the_devices_local_date_not_utc', () {
      // 23:30 local on the 25th is still "today" locally even though its UTC
      // calendar date can already read the 26th in some zones.
      final lateTonight = DateTime(2026, 9, 25, 23, 30);
      final p = plan([session(1, state: PlanSessionState.completed, completedAt: lateTonight), session(2)]);
      final result = selectTodaySession(p, lateTonight);
      expect(result.mode, TodayMode.completedToday);
    });
  });
}
