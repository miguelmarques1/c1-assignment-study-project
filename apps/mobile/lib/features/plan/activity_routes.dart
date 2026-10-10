import 'plan_models.dart';

/// Where an activity's runner lives — one entry per kind, registered by the
/// feature that builds that runner (F16 for the five bank kinds, F17 for
/// `writing`, F18 for `speaking` and `pronunciation`). Mirrors the web's
/// `lib/activity-routes.ts`. A kind with no entry keeps a "start" action from
/// promising a screen nobody built yet (spec A22).
String _objectiveRoute(PlanActivityView activity) => '/activity/${activity.id}';

final Map<PlanActivityKind, String Function(PlanActivityView activity)> activityRoutes = {
  PlanActivityKind.listening: _objectiveRoute,
  PlanActivityKind.reading: _objectiveRoute,
  PlanActivityKind.vocabulary: _objectiveRoute,
  PlanActivityKind.grammar: _objectiveRoute,
  PlanActivityKind.errorReview: _objectiveRoute,
  PlanActivityKind.writing: (activity) => '/app/plan/activities/${activity.id}/writing',
  PlanActivityKind.pronunciation: (activity) => '/app/speaking/${activity.id}',
  PlanActivityKind.speaking: (activity) => '/app/speaking/${activity.id}',
};

/// The route for an activity, or null when no runner is registered for its kind.
String? activityRouteFor(PlanActivityView activity) => activityRoutes[activity.kind]?.call(activity);
