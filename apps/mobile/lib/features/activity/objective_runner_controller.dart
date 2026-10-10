import 'dart:async';

import 'package:get/get.dart';

import '../../core/connectivity/connectivity_service.dart';
import '../../core/network/api_exception.dart';
import '../plan/plan_models.dart';
import 'active_time_tracker.dart';
import 'activities_api.dart';
import 'activity_draft_store.dart';
import 'activity_models.dart';
import 'activity_navigation.dart';
import 'draft_reconciliation.dart';

enum RunnerPhase { answering, submitting, waitingForConnection, saveFailed, results, unavailable }

enum UnavailableReason { replaced, skipped, notRunnable, notObjective }

const resumedNotice = 'Picking up where you left off.';

/// The wait between automatic retries while the connection is down (A31);
/// the last value repeats.
const defaultRetryDelays = [Duration(seconds: 5), Duration(seconds: 15), Duration(seconds: 30), Duration(seconds: 60)];

/// The runner's state machine, the twin of the web's `useObjectiveRunner`:
/// draft reconciliation on load, the attempt created lazily on the first
/// confirmed answer (A4), answers locked and saved one at a time, and a
/// submission that waits and retries instead of losing anything (A31).
/// Results appear only after the server answered 200.
class ObjectiveRunnerController extends GetxController {
  ObjectiveRunnerController(
    this._api,
    this._store,
    this.activityId, {
    ActiveTimeTracker? time,
    this.connectivity,
    this.retryDelays = defaultRetryDelays,
  }) : _time = time ?? ActiveTimeTracker();

  final ActivitiesApi _api;
  final ActivityDraftStore _store;
  final String activityId;
  final ActiveTimeTracker _time;
  final ConnectivityService? connectivity;
  final List<Duration> retryDelays;

  final view = Rxn<ActivityView>();
  final loaded = false.obs;
  final loadError = Rxn<ApiException>();
  final phase = RunnerPhase.answering.obs;
  final unavailable = Rxn<UnavailableReason>();
  final notice = Rxn<String>();
  final answers = <ObjectiveAnswer>[].obs;
  final index = 0.obs;
  final pending = Rxn<ObjectiveAnswer>();

  /// An earlier question being reviewed read-only, or null.
  final viewing = Rxn<int>();
  final audioFailed = false.obs;

  String? _attemptId;
  Future<String?>? _starting;
  var _submitting = false;
  var _settled = false;
  var _retryIndex = 0;
  Timer? _retryTimer;
  Worker? _linkWorker;

  List<ObjectiveQuestion> get questions => view.value?.objective?.item.questions ?? const [];
  ObjectiveQuestion? get current => index.value < questions.length ? questions[index.value] : null;
  bool get isLast => index.value >= questions.length - 1;

  bool get canConfirm {
    final question = current;
    if (question == null) return false;
    if (!question.isScored) return true;
    return pending.value?.index == question.index;
  }

  NextStep get next => nextStep(view.value!);

  ObjectiveAnswer? lockedAnswer(ObjectiveQuestion question) {
    for (final answer in answers) {
      if (answer.index == question.index) return answer;
    }
    return null;
  }

  Future<void> load() async {
    loadError.value = null;
    try {
      final loadedView = await _api.view(activityId);
      view.value = loadedView;
      _attemptId = loadedView.objective?.openAttempt?.id;
      final draft = await _store.load(loadedView.activity.lineage);
      _reconcile(loadedView, draft);
      loaded.value = true;
    } on ApiException catch (error) {
      loadError.value = error;
    }
  }

  void _reconcile(ActivityView loadedView, ActivityDraft? draft) {
    final outcome = reconcileDraft(loadedView, draft);
    switch (outcome) {
      case ShowResults():
        unawaited(_store.clear(loadedView.activity.lineage));
        if (loadedView.objective?.result != null) {
          phase.value = RunnerPhase.results;
        } else {
          _goUnavailable(UnavailableReason.notObjective);
        }
      case ShowUnavailable():
        _goUnavailable(loadedView.activity.state == PlanActivityState.skipped ? UnavailableReason.skipped : UnavailableReason.replaced);
      case StartFresh():
        if (loadedView.objective?.runnable == false) {
          _goUnavailable(UnavailableReason.notRunnable);
          return;
        }
        _attemptId = outcome.attemptId;
        if (outcome.notice != null) {
          notice.value = outcome.notice;
          unawaited(_store.clear(loadedView.activity.lineage));
        }
        _time.start();
      case RestoreDraft():
        _attemptId = outcome.attemptId;
        answers.assignAll(outcome.draft.answers);
        _time.seed(outcome.draft.activeSeconds);
        _time.start();
        index.value = firstUnansweredIndex(questions, outcome.draft.answers);
        notice.value = resumedNotice;
        if (outcome.resumeSubmit) unawaited(_submit(outcome.draft.answers));
    }
  }

  void _goUnavailable(UnavailableReason reason) {
    _settled = true;
    _time.stop();
    final lineage = view.value?.activity.lineage;
    if (lineage != null) unawaited(_store.clear(lineage));
    unavailable.value = reason;
    phase.value = RunnerPhase.unavailable;
  }

  void select(ObjectiveAnswer answer) => pending.value = answer;

  void review(int? position) => viewing.value = position == index.value ? null : position;

  void onAudioError() => audioFailed.value = true;

  void onAudioRetry() => audioFailed.value = false;

  /// The first play of a listening activity creates the attempt (A4).
  void onFirstPlay() => unawaited(_ensureAttempt());

  /// `Next question` locks the answer and saves the draft; on the last question it submits.
  void confirm() {
    final question = current;
    if (question == null || phase.value != RunnerPhase.answering || !canConfirm) return;
    var nextAnswers = List<ObjectiveAnswer>.of(answers);
    if (question.isScored) {
      nextAnswers = [...answers.where((answer) => answer.index != question.index), pending.value!];
      answers.assignAll(nextAnswers);
      unawaited(_persist(nextAnswers, pendingSubmission: false));
      unawaited(_ensureAttempt());
    }
    pending.value = null;
    viewing.value = null;
    if (isLast) {
      unawaited(_submit(nextAnswers));
    } else {
      index.value += 1;
    }
  }

  Future<void> retryNow() {
    _retryIndex = 0;
    return _submit(List.of(answers));
  }

  Future<void> _persist(List<ObjectiveAnswer> toSave, {required bool pendingSubmission}) async {
    final current = view.value;
    if (current?.objective == null) return;
    await _store.save(
      ActivityDraft(
        activityId: current!.activity.id,
        attemptId: _attemptId,
        fingerprint: current.objective!.item.questionsFingerprint,
        answers: toSave,
        activeSeconds: _time.read(),
        pendingSubmission: pendingSubmission,
        savedAt: DateTime.now().toUtc().toIso8601String(),
      ),
    );
  }

  UnavailableReason? _unavailableFor(ApiException error) => switch (error.code) {
    'ACT003' => UnavailableReason.skipped,
    'PLAN004' => UnavailableReason.replaced,
    'ACT006' => UnavailableReason.notRunnable,
    'ACT001' => UnavailableReason.notObjective,
    _ => null,
  };

  /// Creates the attempt once, on the first interaction. A failure keeps the learner going locally.
  Future<String?> _ensureAttempt() {
    if (_attemptId != null) return Future.value(_attemptId);
    return _starting ??= _start();
  }

  Future<String?> _start() async {
    try {
      final started = await _api.start(view.value!.activity.id);
      final attempt = started.objective?.attempt;
      if (started.objective?.result != null) {
        _settled = true;
        unawaited(_store.clear(view.value!.activity.lineage));
        view.value = started;
        phase.value = RunnerPhase.results;
        return null;
      }
      if (attempt == null) return null;
      _attemptId = attempt.id;
      final changed = started.objective!.item.questionsFingerprint != view.value!.objective!.item.questionsFingerprint;
      if (changed) {
        // The item was re-imported after the page loaded: the attempt snapshots the new questions.
        unawaited(_store.clear(view.value!.activity.lineage));
        answers.clear();
        index.value = 0;
        pending.value = null;
        viewing.value = null;
        notice.value = draftUpdatedNotice;
      }
      view.value = started;
      unawaited(_persist(List.of(answers), pendingSubmission: false));
      return attempt.id;
    } on ApiException catch (error) {
      final reason = _unavailableFor(error);
      if (reason != null) _goUnavailable(reason);
      return null;
    } finally {
      _starting = null;
    }
  }

  Future<void> _submit(List<ObjectiveAnswer> toSend) async {
    if (_submitting) return;
    _submitting = true;
    _retryTimer?.cancel();
    phase.value = RunnerPhase.submitting;
    await _persist(toSend, pendingSubmission: true);
    try {
      final attemptId = await _ensureAttempt();
      if (attemptId == null) {
        if (_settled) return;
        _enterWaiting();
        return;
      }
      if (toSend.isNotEmpty && answers.isEmpty) {
        // The item changed while the attempt was being created: the answers were cleared.
        phase.value = RunnerPhase.answering;
        return;
      }
      final current = view.value!;
      final result = await _api.submit(
        current.activity.id,
        attemptId,
        questionsFingerprint: current.objective!.item.questionsFingerprint,
        timeSpentSeconds: _time.read(),
        answers: toSend,
      );
      _settled = true;
      _time.stop();
      await _store.clear(current.activity.lineage);
      _retryIndex = 0;
      view.value = result;
      phase.value = RunnerPhase.results;
    } on ApiException catch (error) {
      final reason = _unavailableFor(error);
      if (reason != null) {
        _goUnavailable(reason);
      } else if (error.cause == ApiFailureCause.noConnection) {
        _enterWaiting();
      } else {
        // A server failure (or an expired session, whose login flow keeps the draft) waits for a human.
        phase.value = RunnerPhase.saveFailed;
      }
    } finally {
      _submitting = false;
    }
  }

  void _enterWaiting() {
    phase.value = RunnerPhase.waitingForConnection;
    final delay = retryDelays[_retryIndex < retryDelays.length ? _retryIndex : retryDelays.length - 1];
    _retryTimer?.cancel();
    _retryTimer = Timer(delay, () {
      _retryIndex += 1;
      unawaited(_submit(List.of(answers)));
    });
    _linkWorker ??= connectivity == null
        ? null
        : ever<bool>(connectivity!.hasLink, (hasLink) {
            if (hasLink && phase.value == RunnerPhase.waitingForConnection) unawaited(retryNow());
          });
  }

  @override
  void onClose() {
    _retryTimer?.cancel();
    _linkWorker?.dispose();
    _time.stop();
    super.onClose();
  }
}
