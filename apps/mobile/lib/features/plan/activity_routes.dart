import 'plan_models.dart';

/// Where an activity's runner lives — one entry per kind, registered by the
/// feature that builds that runner (F16 for the five bank kinds, F17 for
/// `writing`, F18 for `speaking` and `pronunciation`). A kind with no entry
/// keeps a "start" action from promising a screen nobody built yet (spec
/// A22), mirroring the web's `lib/activity-routes.ts`.
final Map<PlanActivityKind, String Function(PlanActivityView activity)> activityRoutes = {
  PlanActivityKind.pronunciation: (activity) => '/app/speaking/${activity.id}',
  PlanActivityKind.speaking: (activity) => '/app/speaking/${activity.id}',
};

/// The route for an activity, or null when no runner is registered for its kind.
String? activityRouteFor(PlanActivityView activity) => activityRoutes[activity.kind]?.call(activity);
