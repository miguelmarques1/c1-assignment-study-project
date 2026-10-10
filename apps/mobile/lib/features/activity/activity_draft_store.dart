import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'activity_models.dart';

/// The learner's answers, kept on this device as they are given (A6): the
/// Dart twin of the web's `ActivityDraft`.
class ActivityDraft {
  const ActivityDraft({
    required this.activityId,
    required this.attemptId,
    required this.fingerprint,
    required this.answers,
    required this.activeSeconds,
    required this.pendingSubmission,
    required this.savedAt,
  });

  static ActivityDraft? tryFromJson(Object? value) {
    if (value is! Map) return null;
    final json = value.cast<String, dynamic>();
    final answers = json['answers'];
    if (json['activityId'] is! String ||
        json['fingerprint'] is! String ||
        json['activeSeconds'] is! int ||
        json['pendingSubmission'] is! bool ||
        json['savedAt'] is! String ||
        answers is! List) {
      return null;
    }
    final parsed = [for (final answer in answers) ObjectiveAnswer.tryFromJson(answer)];
    if (parsed.contains(null)) return null;
    return ActivityDraft(
      activityId: json['activityId'] as String,
      attemptId: json['attemptId'] as String?,
      fingerprint: json['fingerprint'] as String,
      answers: parsed.cast<ObjectiveAnswer>(),
      activeSeconds: json['activeSeconds'] as int,
      pendingSubmission: json['pendingSubmission'] as bool,
      savedAt: json['savedAt'] as String,
    );
  }

  final String activityId;
  final String? attemptId;
  final String fingerprint;
  final List<ObjectiveAnswer> answers;
  final int activeSeconds;
  final bool pendingSubmission;
  final String savedAt;

  ActivityDraft copyWith({String? attemptId}) => ActivityDraft(
    activityId: activityId,
    attemptId: attemptId ?? this.attemptId,
    fingerprint: fingerprint,
    answers: answers,
    activeSeconds: activeSeconds,
    pendingSubmission: pendingSubmission,
    savedAt: savedAt,
  );

  Map<String, Object?> toJson() => {
    'activityId': activityId,
    'attemptId': attemptId,
    'fingerprint': fingerprint,
    'answers': [for (final answer in answers) answer.toJson()],
    'activeSeconds': activeSeconds,
    'pendingSubmission': pendingSubmission,
    'savedAt': savedAt,
  };
}

/// `shared_preferences` under `eq.activity.draft.<activityId>`. Every access
/// is wrapped: a platform exception or a corrupt value behaves like no draft
/// and never breaks the runner. `prefsProvider` defaults to the real plugin.
class ActivityDraftStore {
  ActivityDraftStore({Future<SharedPreferences> Function()? prefsProvider})
    : _prefsProvider = prefsProvider ?? SharedPreferences.getInstance;

  final Future<SharedPreferences> Function() _prefsProvider;

  static String keyOf(String activityId) => 'eq.activity.draft.$activityId';

  /// The newest draft stored under any id of the activity's lineage.
  Future<ActivityDraft?> load(List<String> lineage) async {
    try {
      final prefs = await _prefsProvider();
      ActivityDraft? newest;
      for (final id in lineage) {
        final raw = prefs.getString(keyOf(id));
        if (raw == null) continue;
        ActivityDraft? draft;
        try {
          draft = ActivityDraft.tryFromJson(jsonDecode(raw));
        } catch (_) {
          draft = null;
        }
        if (draft == null) {
          await prefs.remove(keyOf(id));
        } else if (newest == null || draft.savedAt.compareTo(newest.savedAt) > 0) {
          newest = draft;
        }
      }
      return newest;
    } catch (_) {
      return null;
    }
  }

  Future<void> save(ActivityDraft draft) async {
    try {
      final prefs = await _prefsProvider();
      await prefs.setString(keyOf(draft.activityId), jsonEncode(draft.toJson()));
    } catch (_) {
      // The answers stay on screen; they just are not on disk.
    }
  }

  Future<void> clear(List<String> lineage) async {
    try {
      final prefs = await _prefsProvider();
      for (final id in lineage) {
        await prefs.remove(keyOf(id));
      }
    } catch (_) {
      // Nothing to clear if storage is unavailable.
    }
  }
}
