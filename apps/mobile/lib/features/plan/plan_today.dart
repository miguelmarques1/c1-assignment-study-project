import 'plan_models.dart';

enum TodayMode { inProgress, completedToday, next, planComplete }

class TodaySelection {
  const TodaySelection({required this.session, required this.mode});

  /// Null exactly when [mode] is [TodayMode.planComplete].
  final PlanSessionView? session;
  final TodayMode mode;
}

(int, int, int) _localDateKey(DateTime date) => (date.year, date.month, date.day);

/// Which session `Today` shows (spec A16), the same rules and case table as
/// the web's `lib/plan-today.ts`: (1) the earliest session in progress; (2)
/// the latest session completed on the device's local today, so a finished
/// session stays visible with its summary until the day turns; (3) the first
/// untouched session, so a gap in use never skips ahead; (4) none, when the
/// whole plan is done. Pure — [now] is the device's own clock.
TodaySelection selectTodaySession(StudyPlanView plan, DateTime now) {
  for (final session in plan.sessions) {
    if (session.state == PlanSessionState.inProgress) {
      return TodaySelection(session: session, mode: TodayMode.inProgress);
    }
  }

  final todayKey = _localDateKey(now.toLocal());
  final completedToday = plan.sessions.where(
    (session) =>
        session.state == PlanSessionState.completed &&
        session.completedAt != null &&
        _localDateKey(session.completedAt!.toLocal()) == todayKey,
  );
  if (completedToday.isNotEmpty) {
    final latest = completedToday.reduce((best, session) => session.day > best.day ? session : best);
    return TodaySelection(session: latest, mode: TodayMode.completedToday);
  }

  for (final session in plan.sessions) {
    if (session.state == PlanSessionState.notStarted) {
      return TodaySelection(session: session, mode: TodayMode.next);
    }
  }

  return const TodaySelection(session: null, mode: TodayMode.planComplete);
}
