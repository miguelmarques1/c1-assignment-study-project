import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:mobile/core/connectivity/connectivity_service.dart';
import 'package:mobile/features/activity/activities_api.dart';
import 'package:mobile/features/activity/activity_draft_store.dart';
import 'package:mobile/features/activity/activity_models.dart';
import 'package:mobile/features/activity/objective_runner_controller.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/scripted_dio.dart';
import 'activity_fixtures.dart';

const _viewPath = 'GET /activities/$activityId';
const _startPath = 'POST /activities/$activityId/attempts';
const _submitPath = 'PUT /activities/$activityId/attempts/$attemptId/submission';

class _FakeConnectivity implements ConnectivityService {
  @override
  final RxBool hasLink = true.obs;

  @override
  Future<void> refresh() async {}
}

Future<void> settle() async {
  for (var i = 0; i < 12; i++) {
    await Future<void>.delayed(const Duration(milliseconds: 4));
  }
}

ObjectiveAnswer _answerFor(ObjectiveQuestion question) => switch (question) {
  FillBlankQuestion() => ObjectiveAnswer.text(index: question.index, text: 'had heard'),
  _ => ObjectiveAnswer.choice(index: question.index, optionIndex: 1),
};

Future<void> answerEverything(ObjectiveRunnerController controller) async {
  for (var step = 0; step < controller.questions.length; step++) {
    controller.select(_answerFor(controller.current!));
    controller.confirm();
    await settle();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues({}));

  ObjectiveRunnerController build(Map<String, Responder> responders, {ConnectivityService? connectivity, List<Duration>? delays}) {
    final (dio, _) = scriptedDio(responders);
    final controller = ObjectiveRunnerController(
      ActivitiesApi(dio),
      ActivityDraftStore(),
      activityId,
      connectivity: connectivity,
      retryDelays: delays ?? const [Duration(hours: 1)],
    );
    addTearDown(controller.onClose);
    return controller;
  }

  Map<String, Responder> happyPath() => {
    _viewPath: ok(viewJson()),
    _startPath: ok(viewJson(state: 'in_progress', attempt: openAttemptJson())),
    _submitPath: ok(submittedViewJson()),
  };

  test('opening_an_activity_creates_no_attempt', () async {
    final (dio, adapter) = scriptedDio(happyPath());
    final controller = ObjectiveRunnerController(ActivitiesApi(dio), ActivityDraftStore(), activityId);
    addTearDown(controller.onClose);

    await controller.load();

    expect(controller.loaded.value, isTrue);
    expect(controller.phase.value, RunnerPhase.answering);
    expect(adapter.requests.map((request) => request.method), ['GET']);
  });

  test('the_first_confirmed_answer_starts_the_attempt_once', () async {
    final (dio, adapter) = scriptedDio(happyPath());
    final controller = ObjectiveRunnerController(ActivitiesApi(dio), ActivityDraftStore(), activityId);
    addTearDown(controller.onClose);
    await controller.load();

    controller.select(_answerFor(controller.current!));
    controller.confirm();
    await settle();
    controller.select(_answerFor(controller.current!));
    controller.confirm();
    await settle();

    expect(adapter.requests.where((request) => request.method == 'POST'), hasLength(1));
    expect(controller.index.value, 2);
    expect(controller.answers, hasLength(2));
  });

  test('confirm_needs_an_answer_and_next_locks_it', () async {
    final controller = build(happyPath());
    await controller.load();

    controller.confirm();
    expect(controller.index.value, 0);
    expect(controller.canConfirm, isFalse);

    controller.select(const ObjectiveAnswer.choice(index: 0, optionIndex: 3));
    expect(controller.canConfirm, isTrue);
    controller.confirm();
    await settle();
    expect(controller.index.value, 1);
    expect(controller.lockedAnswer(controller.questions[0])!.optionIndex, 3);
    expect((await ActivityDraftStore().load([activityId]))!.answers, hasLength(1));
  });

  test('a_successful_submission_shows_the_results_and_clears_the_draft', () async {
    final controller = build(happyPath());
    await controller.load();

    await answerEverything(controller);

    expect(controller.phase.value, RunnerPhase.results);
    expect(controller.view.value!.objective!.result!.scoreCorrect, 3);
    expect(await ActivityDraftStore().load([activityId]), isNull);
  });

  test('an_offline_submission_waits_and_sends_on_reconnect', () async {
    var submits = 0;
    final connectivity = _FakeConnectivity();
    final controller = build({
      ...happyPath(),
      _submitPath: (options) async {
        submits += 1;
        if (submits == 1) throw DioException(requestOptions: options, type: DioExceptionType.connectionError);
        return jsonBody({'data': submittedViewJson()});
      },
    }, connectivity: connectivity);
    await controller.load();

    await answerEverything(controller);
    expect(controller.phase.value, RunnerPhase.waitingForConnection);
    expect(controller.answers, hasLength(5));
    expect((await ActivityDraftStore().load([activityId]))!.pendingSubmission, isTrue);

    connectivity.hasLink.value = false;
    connectivity.hasLink.value = true;
    await settle();

    expect(controller.phase.value, RunnerPhase.results);
    expect(submits, 2);
  });

  test('the_backoff_resends_without_a_reconnect', () async {
    var submits = 0;
    final controller = build({
      ...happyPath(),
      _submitPath: (options) async {
        submits += 1;
        if (submits == 1) throw DioException(requestOptions: options, type: DioExceptionType.connectionError);
        return jsonBody({'data': submittedViewJson()});
      },
    }, delays: const [Duration(milliseconds: 20)]);
    await controller.load();

    await answerEverything(controller);
    await Future<void>.delayed(const Duration(milliseconds: 120));
    await settle();

    expect(controller.phase.value, RunnerPhase.results);
  });

  test('a_server_failure_keeps_the_answers_and_waits_for_a_retry', () async {
    var submits = 0;
    final controller = build({
      ...happyPath(),
      _submitPath: (options) async {
        submits += 1;
        return submits == 1 ? jsonBody({'error': {'code': 'ERR500', 'message': 'x', 'details': null}}, status: 500) : jsonBody({'data': submittedViewJson()});
      },
    });
    await controller.load();

    await answerEverything(controller);
    expect(controller.phase.value, RunnerPhase.saveFailed);
    expect(controller.view.value!.objective!.result, isNull);
    expect(controller.answers, hasLength(5));

    await controller.retryNow();
    expect(controller.phase.value, RunnerPhase.results);
  });

  test('a_skip_made_elsewhere_ends_on_the_skipped_state', () async {
    final controller = build({...happyPath(), _startPath: failure(409, 'ACT003', 'This activity was skipped.')});
    await controller.load();

    controller.select(_answerFor(controller.current!));
    controller.confirm();
    await settle();

    expect(controller.phase.value, RunnerPhase.unavailable);
    expect(controller.unavailable.value, UnavailableReason.skipped);
    expect(await ActivityDraftStore().load([activityId]), isNull);
  });

  test('a_draft_restores_at_the_first_unanswered_question', () async {
    final store = ActivityDraftStore();
    await store.save(
      ActivityDraft(
        activityId: activityId,
        attemptId: attemptId,
        fingerprint: fingerprint,
        answers: const [ObjectiveAnswer.choice(index: 0, optionIndex: 1), ObjectiveAnswer.text(index: 1, text: 'had heard')],
        activeSeconds: 30,
        pendingSubmission: false,
        savedAt: '2026-10-02T07:40:00.000Z',
      ),
    );
    final controller = build({_viewPath: ok(viewJson(state: 'in_progress', attempt: openAttemptJson()))});

    await controller.load();

    expect(controller.index.value, 2);
    expect(controller.notice.value, resumedNotice);
    expect(controller.answers, hasLength(2));
  });

  test('a_pending_submission_is_resent_on_reopen', () async {
    final store = ActivityDraftStore();
    await store.save(
      ActivityDraft(
        activityId: activityId,
        attemptId: attemptId,
        fingerprint: fingerprint,
        answers: [for (var i = 0; i < 5; i++) i.isOdd ? ObjectiveAnswer.text(index: i, text: 'x') : ObjectiveAnswer.choice(index: i, optionIndex: 1)],
        activeSeconds: 90,
        pendingSubmission: true,
        savedAt: '2026-10-02T07:40:00.000Z',
      ),
    );
    final controller = build({
      _viewPath: ok(viewJson(state: 'in_progress', attempt: openAttemptJson())),
      _submitPath: ok(submittedViewJson()),
    });

    await controller.load();
    await settle();

    expect(controller.phase.value, RunnerPhase.results);
  });

  test('a_submitted_activity_opens_on_its_results', () async {
    final controller = build({_viewPath: ok(submittedViewJson())});
    await controller.load();
    expect(controller.phase.value, RunnerPhase.results);
  });

  test('an_unrunnable_item_is_unavailable', () async {
    final controller = build({_viewPath: ok(viewJson(runnable: false))});
    await controller.load();
    expect(controller.unavailable.value, UnavailableReason.notRunnable);
  });

  test('a_load_failure_is_kept_for_the_retry_state', () async {
    final controller = build({_viewPath: offline()});
    await controller.load();
    expect(controller.loaded.value, isFalse);
    expect(controller.loadError.value!.message, 'No connection');
  });
}
