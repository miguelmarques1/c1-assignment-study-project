import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// The learner's own unsent draft, kept on this device only (spec A7) — the
/// Dart twin of `writing-draft-store.ts`. The key is `eq.writing.draft.<taskId>`
/// and the value is `{ text, baseRevision, editedAt, pendingActiveSeconds }`,
/// keyed by task id (not activity id) so a carried-over activity still finds
/// its local copy.
class LocalWritingDraft {
  const LocalWritingDraft({
    required this.text,
    required this.baseRevision,
    required this.editedAt,
    required this.pendingActiveSeconds,
  });

  factory LocalWritingDraft.fromJson(Map<String, dynamic> json) => LocalWritingDraft(
    text: json['text'] as String,
    baseRevision: json['baseRevision'] as int,
    editedAt: DateTime.parse(json['editedAt'] as String),
    pendingActiveSeconds: json['pendingActiveSeconds'] as int,
  );

  final String text;
  final int baseRevision;
  final DateTime editedAt;
  final int pendingActiveSeconds;

  Map<String, dynamic> toJson() => {
    'text': text,
    'baseRevision': baseRevision,
    'editedAt': editedAt.toIso8601String(),
    'pendingActiveSeconds': pendingActiveSeconds,
  };
}

/// Every access is wrapped against platform exceptions: a denied permission
/// or a full disk must never break the editor, only the "not synced"
/// indicator. The copy is removed once a submission is accepted or the task
/// is corrected. `prefsProvider` defaults to the real plugin; a test
/// overrides it to simulate a platform exception.
class WritingDraftStore {
  WritingDraftStore({Future<SharedPreferences> Function()? prefsProvider}) : _prefsProvider = prefsProvider ?? SharedPreferences.getInstance;

  final Future<SharedPreferences> Function() _prefsProvider;

  String _key(String taskId) => 'eq.writing.draft.$taskId';

  Future<LocalWritingDraft?> read(String taskId) async {
    try {
      final prefs = await _prefsProvider();
      final raw = prefs.getString(_key(taskId));
      if (raw == null) {
        return null;
      }
      return LocalWritingDraft.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<void> write(String taskId, LocalWritingDraft value) async {
    try {
      final prefs = await _prefsProvider();
      await prefs.setString(_key(taskId), jsonEncode(value.toJson()));
    } catch (_) {
      // Best-effort only — the server copy is what every other device and the next visit resume from.
    }
  }

  Future<void> clear(String taskId) async {
    try {
      final prefs = await _prefsProvider();
      await prefs.remove(_key(taskId));
    } catch (_) {
      // Nothing to clean up if storage was never reachable.
    }
  }
}
