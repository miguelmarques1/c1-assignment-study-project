import 'dart:async';

import 'package:get/get.dart';

import '../../core/network/api_exception.dart';
import 'draft_reconcile.dart';
import 'writing_api.dart';
import 'writing_draft_store.dart';
import 'writing_models.dart';
import 'writing_submission_id.dart';

enum WritingLoadState { loading, error, ready }

enum WritingSaveState { saved, saving, localOnly, conflict }

enum FlushResult { saved, conflict, localOnly }

/// `conflict`: a save was rejected as stale (`WRIT004`). `submittedElsewhere`:
/// another device already submitted this task while this one had unsynced
/// edits. Both freeze the editor behind a banner; only their copy differs.
enum DraftConflictVariant { conflict, submittedElsewhere }

class ActiveDraftConflict {
  const ActiveDraftConflict({required this.variant, required this.serverDraft});

  final DraftConflictVariant variant;
  final WritingDraftConflict serverDraft;
}

const Set<WritingTaskStatus> _editableStatuses = {
  WritingTaskStatus.draft,
  WritingTaskStatus.uncorrected,
  WritingTaskStatus.correctionFailed,
};

/// Loads and opens the activity, runs the local and server autosave and the
/// poll while correcting, flushes on pause and reconciles on resume, handles
/// conflicts and notices, and submits (spec §4). Timers and the
/// `AppLifecycleListener` live in `WritingPage`'s `State`, which calls the
/// plain methods below — this controller holds no `Timer` and no
/// `BuildContext`, matching this app's "GetX for reactivity only" rule.
class WritingController extends GetxController {
  WritingController(this._api, this._draftStore, this.activityId);

  final WritingApi _api;
  final WritingDraftStore _draftStore;
  final String activityId;

  final loadState = WritingLoadState.loading.obs;
  final Rxn<WritingActivityView> view = Rxn<WritingActivityView>();
  final Rxn<ApiException> loadError = Rxn<ApiException>();

  final text = ''.obs;
  final revision = 0.obs;
  final saveState = WritingSaveState.saved.obs;
  final Rxn<DateTime> savedAt = Rxn<DateTime>();
  final Rxn<ActiveDraftConflict> conflict = Rxn<ActiveDraftConflict>();
  final RxnString localVersionText = RxnString();

  final submitting = false.obs;
  final RxnString submitError = RxnString();

  String? _taskId;
  String _lastLocalSavedText = '';
  String _lastServerSavedText = '';
  int _activeSeconds = 0;
  DateTime? _resumedAt;
  bool _saving = false;
  WritingActivityView? _pendingSettledView;

  bool get isCorrecting => view.value?.status == WritingTaskStatus.correcting;

  Future<void> open() async {
    loadState.value = WritingLoadState.loading;
    loadError.value = null;
    try {
      final result = await _api.open(activityId);
      await _applyFreshView(result, reconcileLocal: true);
      loadState.value = WritingLoadState.ready;
    } on ApiException catch (failure) {
      loadError.value = failure;
      loadState.value = WritingLoadState.error;
    }
  }

  Future<void> reload() => open();

  Future<void> _applyFreshView(WritingActivityView result, {required bool reconcileLocal}) async {
    view.value = result;
    _taskId = result.taskId;
    _resumedAt = DateTime.now();

    if (reconcileLocal && _editableStatuses.contains(result.status)) {
      final local = await _draftStore.read(result.taskId);
      final reconciliation = reconcileDraft(
        local == null ? null : LocalDraftForReconcile(text: local.text, baseRevision: local.baseRevision),
        ServerDraftForReconcile(status: result.status, text: result.draft.text, revision: result.draft.revision),
      );

      if (reconciliation.kind == DraftReconciliationKind.useLocal && local != null) {
        text.value = local.text;
        revision.value = result.draft.revision;
        savedAt.value = result.draft.savedAt;
        _lastLocalSavedText = local.text;
        // `_lastServerSavedText` stays at the server's text, so the first flush pushes the unsynced work.
        _lastServerSavedText = result.draft.text;
        _activeSeconds = local.pendingActiveSeconds;
        unawaited(_flush());
        return;
      }
      if (reconciliation.kind == DraftReconciliationKind.conflict && local != null) {
        _enterConflict(DraftConflictVariant.conflict, _asConflict(result.draft), local.text);
        return;
      }
      await _draftStore.clear(result.taskId);
    }

    text.value = result.draft.text;
    revision.value = result.draft.revision;
    savedAt.value = result.draft.savedAt;
    _lastLocalSavedText = result.draft.text;
    _lastServerSavedText = result.draft.text;
    saveState.value = WritingSaveState.saved;
  }

  WritingDraftConflict _asConflict(WritingDraftView draft) =>
      WritingDraftConflict(text: draft.text, revision: draft.revision, savedAt: draft.savedAt);

  void _enterConflict(DraftConflictVariant variant, WritingDraftConflict serverDraft, String localText) {
    // The editor goes read-only and shows the server's copy (A6); the local edit survives in `localVersionText`.
    conflict.value = ActiveDraftConflict(variant: variant, serverDraft: serverDraft);
    localVersionText.value = localText;
    text.value = serverDraft.text;
    revision.value = serverDraft.revision;
    savedAt.value = serverDraft.savedAt;
    _lastServerSavedText = serverDraft.text;
    _lastLocalSavedText = serverDraft.text;
    saveState.value = WritingSaveState.conflict;
  }

  void setText(String value) => text.value = value;

  void _accumulateActiveSeconds() {
    final now = DateTime.now();
    final resumedAt = _resumedAt;
    if (resumedAt != null) {
      _activeSeconds += now.difference(resumedAt).inSeconds;
    }
    _resumedAt = now;
  }

  /// The 5-second local autosave tick.
  Future<void> saveLocalIfChanged() async {
    final taskId = _taskId;
    if (taskId == null || conflict.value != null || text.value == _lastLocalSavedText) {
      return;
    }
    await _draftStore.write(
      taskId,
      LocalWritingDraft(text: text.value, baseRevision: revision.value, editedAt: DateTime.now(), pendingActiveSeconds: _activeSeconds),
    );
    _lastLocalSavedText = text.value;
  }

  /// The 30-second server autosave tick.
  Future<void> saveServerIfChanged() async {
    if (conflict.value != null || text.value == _lastServerSavedText) {
      return;
    }
    await _flush();
  }

  Future<FlushResult> _flush() async {
    final taskId = _taskId;
    if (conflict.value != null) {
      return FlushResult.conflict;
    }
    if (_saving || taskId == null) {
      return FlushResult.localOnly;
    }
    final currentText = text.value;
    if (currentText == _lastServerSavedText) {
      return FlushResult.saved;
    }

    _accumulateActiveSeconds();
    final delta = _activeSeconds.clamp(0, writingActiveSecondsMaxDelta);
    _saving = true;
    saveState.value = WritingSaveState.saving;
    try {
      final result = await _api.saveDraft(activityId, text: currentText, baseRevision: revision.value, activeSecondsDelta: delta);
      _activeSeconds = 0;
      _lastServerSavedText = currentText;
      _lastLocalSavedText = currentText;
      revision.value = result.revision;
      savedAt.value = result.savedAt;
      saveState.value = WritingSaveState.saved;
      await _draftStore.clear(taskId);
      return FlushResult.saved;
    } on ApiException catch (failure) {
      if (failure.code == 'WRIT004') {
        final draft = failure.details?['draft'] as Map<String, dynamic>?;
        if (draft != null) {
          _enterConflict(DraftConflictVariant.conflict, WritingDraftConflict.fromJson(draft), currentText);
        }
        return FlushResult.conflict;
      }
      await _draftStore.write(
        taskId,
        LocalWritingDraft(text: currentText, baseRevision: revision.value, editedAt: DateTime.now(), pendingActiveSeconds: _activeSeconds),
      );
      saveState.value = WritingSaveState.localOnly;
      return FlushResult.localOnly;
    } finally {
      _saving = false;
    }
  }

  /// Flushes locally and to the server when the app pauses, so it never loses more than a few seconds.
  Future<void> flushOnPause() async {
    await saveLocalIfChanged();
    await _flush();
  }

  /// Reconciles on app resume, after a fresh read.
  Future<void> reconcileOnResume() async {
    _resumedAt = DateTime.now();
    if (view.value == null) {
      return;
    }
    try {
      final fresh = await _api.read(activityId);

      if (!_editableStatuses.contains(fresh.status)) {
        final hasUnsavedEdits = text.value != _lastServerSavedText;
        if (hasUnsavedEdits && text.value != fresh.draft.text) {
          // Submitted from another device while this one had unsynced work: surface it, don't discard it (A6).
          _pendingSettledView = fresh;
          conflict.value = ActiveDraftConflict(
            variant: DraftConflictVariant.submittedElsewhere,
            serverDraft: WritingDraftConflict(text: fresh.draft.text, revision: fresh.draft.revision, savedAt: fresh.draft.savedAt),
          );
          localVersionText.value = text.value;
          return;
        }
        view.value = fresh;
        await _draftStore.clear(fresh.taskId);
        return;
      }

      // With nothing unsaved, there is no local work to protect — always adopt the fresh copy.
      final hasUnsavedEdits = text.value != _lastServerSavedText;
      final reconciliation = hasUnsavedEdits
          ? reconcileDraft(
              LocalDraftForReconcile(text: text.value, baseRevision: revision.value),
              ServerDraftForReconcile(status: fresh.status, text: fresh.draft.text, revision: fresh.draft.revision),
            )
          : const DraftReconciliation(DraftReconciliationKind.useServer);

      switch (reconciliation.kind) {
        case DraftReconciliationKind.useServer:
          text.value = fresh.draft.text;
          revision.value = fresh.draft.revision;
          savedAt.value = fresh.draft.savedAt;
          _lastServerSavedText = fresh.draft.text;
          _lastLocalSavedText = fresh.draft.text;
          view.value = fresh;
          await _draftStore.clear(fresh.taskId);
        case DraftReconciliationKind.conflict:
          view.value = fresh;
          _enterConflict(DraftConflictVariant.conflict, _asConflict(fresh.draft), text.value);
        case DraftReconciliationKind.useLocal:
        case DraftReconciliationKind.submittedElsewhere:
          break; // Nothing to do — the next autosave tick pushes it.
      }
    } on ApiException {
      // Transient; the next autosave tick or resume retries.
    }
  }

  /// `View your version` / `Continue with the latest version` (or `Dismiss`).
  Future<void> continueWithConflict() async {
    final active = conflict.value;
    if (active == null) {
      return;
    }

    if (active.variant == DraftConflictVariant.submittedElsewhere) {
      conflict.value = null;
      localVersionText.value = null;
      final settled = _pendingSettledView;
      _pendingSettledView = null;
      if (settled != null) {
        view.value = settled;
        await _draftStore.clear(settled.taskId);
      }
      return;
    }

    text.value = active.serverDraft.text;
    revision.value = active.serverDraft.revision;
    savedAt.value = active.serverDraft.savedAt;
    _lastServerSavedText = active.serverDraft.text;
    _lastLocalSavedText = active.serverDraft.text;
    _activeSeconds = 0;
    conflict.value = null;
    localVersionText.value = null;
    saveState.value = WritingSaveState.saved;
    final taskId = _taskId;
    if (taskId != null) {
      await _draftStore.clear(taskId);
    }
  }

  /// The 3-second poll while `correcting`.
  Future<void> pollWhileCorrecting() async {
    if (!isCorrecting) {
      return;
    }
    try {
      view.value = await _api.read(activityId);
    } on ApiException {
      // Transient; the next tick retries.
    }
  }

  /// A submission is a flush followed by a submit by revision (A9).
  Future<bool> submit() async {
    final flushed = await _flush();
    if (flushed == FlushResult.conflict) {
      // The conflict banner now owns the screen; submitting against a revision we know is stale would be wrong (A5).
      return false;
    }
    final baseRevision = flushed == FlushResult.saved ? revision.value : view.value?.draft.revision;
    if (baseRevision == null) {
      submitError.value = 'Your draft could not be saved. Please try again.';
      return false;
    }
    return _doSubmit(baseRevision);
  }

  Future<bool> retryCorrection() async {
    final current = view.value;
    if (current == null) {
      return false;
    }
    return _doSubmit(current.draft.revision);
  }

  Future<bool> _doSubmit(int baseRevision) async {
    submitting.value = true;
    submitError.value = null;
    try {
      final result = await _api.submit(activityId, submissionId: generateSubmissionId(), baseRevision: baseRevision);
      view.value = result;
      text.value = result.draft.text;
      revision.value = result.draft.revision;
      return true;
    } on ApiException catch (failure) {
      submitError.value = failure.message;
      return false;
    } finally {
      submitting.value = false;
    }
  }
}
