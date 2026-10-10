import '../plan/activity_routes.dart';
import '../plan/plan_models.dart';
import 'activity_models.dart';

const todayRoute = '/app/today';

/// Where the primary action after a session activity leads (A22): the first
/// other unfinished activity of the session, in order, when its kind has a
/// runner; otherwise Today. It never skips ahead past an unroutable one.
class NextStep {
  const NextStep.next({required this.path, required PlanActivityView this.activity});
  const NextStep.today() : path = todayRoute, activity = null;

  final String path;
  final PlanActivityView? activity;

  bool get isNext => activity != null;
  String get label => isNext ? 'Next activity' : 'Back to Today';
}

NextStep nextStep(ActivityView view) {
  final others = [...view.session.activities]..sort((a, b) => a.position.compareTo(b.position));
  for (final activity in others) {
    if (activity.id == view.activity.id) continue;
    if (activity.state == PlanActivityState.pending || activity.state == PlanActivityState.inProgress) {
      final path = activityRouteFor(activity);
      return path == null ? const NextStep.today() : NextStep.next(path: path, activity: activity);
    }
  }
  return const NextStep.today();
}
