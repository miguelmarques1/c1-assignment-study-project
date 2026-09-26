import 'json_read.dart';

class ScenarioRole {
  const ScenarioRole({required this.label, required this.relationship});

  factory ScenarioRole.fromJson(Json json) =>
      ScenarioRole(label: json['label'] as String, relationship: json['relationship'] as String);

  final String label;
  final String relationship;
}

/// The shared situation — every participant may see it.
class SharedSituation {
  const SharedSituation({
    required this.title,
    required this.setting,
    required this.premise,
    required this.roles,
    required this.vocabularyDomain,
    required this.discussionHooks,
  });

  factory SharedSituation.fromJson(Json json) => SharedSituation(
    title: json['title'] as String?,
    setting: json['setting'] as String,
    premise: json['premise'] as String,
    roles: readList(json['roles'], ScenarioRole.fromJson),
    vocabularyDomain: json['vocabularyDomain'] as String,
    discussionHooks: readStrings(json['discussionHooks']),
  );

  final String? title;
  final String setting;
  final String premise;
  final List<ScenarioRole> roles;
  final String vocabularyDomain;
  final List<String> discussionHooks;
}

/// The caller's own private card; content is null until it is `ready`.
class RoleCard {
  const RoleCard({
    required this.status,
    required this.background,
    required this.objective,
    required this.constraint,
    required this.register,
    required this.targetExpressions,
  });

  factory RoleCard.fromJson(Json json) => RoleCard(
    status: json['status'] as String,
    background: json['background'] as String?,
    objective: json['objective'] as String?,
    constraint: json['constraint'] as String?,
    register: json['register'] as String?,
    targetExpressions: json['targetExpressions'] == null ? null : readStrings(json['targetExpressions']),
  );

  final String status;
  final String? background;
  final String? objective;
  final String? constraint;
  final String? register;
  final List<String>? targetExpressions;
}

/// `GET /lessons/:lessonId/scenario` — there is no field that could hold another participant's card.
class LessonScenarioView {
  const LessonScenarioView({
    required this.lessonId,
    required this.status,
    required this.situation,
    required this.myRoleLabel,
    required this.myCard,
  });

  factory LessonScenarioView.fromJson(Json json) => LessonScenarioView(
    lessonId: json['lessonId'] as String,
    status: json['status'] as String,
    situation: readObject(json['situation'], SharedSituation.fromJson),
    myRoleLabel: json['myRoleLabel'] as String?,
    myCard: readObject(json['myCard'], RoleCard.fromJson),
  );

  final String lessonId;
  final String status;
  final SharedSituation? situation;
  final String? myRoleLabel;
  final RoleCard? myCard;
}

const registerLabels = {
  'formal': 'Formal register',
  'neutral': 'Neutral register',
  'informal': 'Informal register',
};
