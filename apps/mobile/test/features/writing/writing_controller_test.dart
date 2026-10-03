import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/network/api_exception.dart';
import 'package:mobile/features/plan/plan_models.dart';
import 'package:mobile/features/writing/writing_api.dart';
import 'package:mobile/features/writing/writing_controller.dart';
import 'package:mobile/features/writing/writing_draft_store.dart';
import 'package:mobile/features/writing/writing_models.dart';
import 'package:mocktail/mocktail.dart';

class _MockWritingApi extends Mock implements WritingApi {}

class _MockWritingDraftStore extends Mock implements WritingDraftStore {}

const _activityId = '11111111-1111-4111-8111-111111111111';
const _taskId = '22222222-2222-4222-8222-222222222222';
const _planId = '33333333-3333-4333-8333-333333333333';

WritingActivityView _view({
  WritingTaskStatus status = WritingTaskStatus.draft,
  String text = 'Some draft text',
  int revision = 1,
  DateTime? savedAt,
  bool geminiKeyUsable = true,
  int used = 0,
  WritingCorrectionView? correction,
}) {
  return WritingActivityView(
    activityId: _activityId,
    taskId: _taskId,
    planId: _planId,
    activityState: PlanActivityState.inProgress,
    readOnly: false,
    title: 'Writing: Third conditional',
    task: const WritingTaskView(heading: 'Letter to the editor', statement: 'Write a letter.', targetTags: []),
    status: status,
    draft: WritingDraftView(text: text, revision: revision, savedAt: savedAt),
    submittedAt: null,
    failure: null,
    correction: correction,
    submission: WritingSubmissionView(geminiKeyUsable: geminiKeyUsable, dailyLimit: WritingLimitView(max: 10, used: used, resetsAt: null)),
    serverTime: DateTime.parse('2026-10-02T08:42:03.000Z'),
  );
}

void main() {
  late _MockWritingApi api;
  late _MockWritingDraftStore store;
  late WritingController controller;

  setUpAll(() {
    registerFallbackValue(
      LocalWritingDraft(text: '', baseRevision: 0, editedAt: DateTime.now(), pendingActiveSeconds: 0),
    );
  });

  setUp(() {
    api = _MockWritingApi();
    store = _MockWritingDraftStore();
    when(() => store.read(any())).thenAnswer((_) async => null);
    when(() => store.write(any(), any())).thenAnswer((_) async {});
    when(() => store.clear(any())).thenAnswer((_) async {});
    controller = WritingController(api, store, _activityId);
  });

  group('open', () {
    test('loads_the_activity_and_adopts_the_servers_draft_with_no_local_copy', () async {
      when(() => api.open(_activityId)).thenAnswer((_) async => _view(text: 'Server text', revision: 3));

      await controller.open();

      expect(controller.loadState.value, WritingLoadState.ready);
      expect(controller.text.value, 'Server text');
      expect(controller.revision.value, 3);
    });

    test('a_failed_open_enters_the_error_state', () async {
      when(() => api.open(_activityId)).thenThrow(const ApiException(cause: ApiFailureCause.noConnection, message: 'No connection'));

      await controller.open();

      expect(controller.loadState.value, WritingLoadState.error);
      expect(controller.loadError.value?.message, 'No connection');
    });

    test('a_local_copy_at_the_same_revision_with_different_text_is_pushed_at_once', () async {
      when(() => api.open(_activityId)).thenAnswer((_) async => _view(text: 'Server text', revision: 3));
      when(() => store.read(_taskId)).thenAnswer(
        (_) async => LocalWritingDraft(text: 'Local unsynced text', baseRevision: 3, editedAt: DateTime.now(), pendingActiveSeconds: 7),
      );
      when(() => api.saveDraft(_activityId, text: any(named: 'text'), baseRevision: any(named: 'baseRevision'), activeSecondsDelta: any(named: 'activeSecondsDelta')))
          .thenAnswer((_) async => WritingDraftSaved(revision: 4, savedAt: DateTime.parse('2026-10-02T08:43:00.000Z')));

      await controller.open();

      expect(controller.text.value, 'Local unsynced text');
      verify(() => api.saveDraft(_activityId, text: 'Local unsynced text', baseRevision: 3, activeSecondsDelta: 7)).called(1);
    });

    test('a_local_copy_at_an_older_revision_with_different_text_is_a_conflict', () async {
      when(() => api.open(_activityId)).thenAnswer((_) async => _view(text: 'Server text', revision: 5));
      when(() => store.read(_taskId)).thenAnswer(
        (_) async => LocalWritingDraft(text: 'Local stale text', baseRevision: 3, editedAt: DateTime.now(), pendingActiveSeconds: 0),
      );

      await controller.open();

      expect(controller.conflict.value, isNotNull);
      expect(controller.conflict.value!.variant, DraftConflictVariant.conflict);
      expect(controller.text.value, 'Server text');
      expect(controller.localVersionText.value, 'Local stale text');
    });
  });

  group('saveLocalIfChanged', () {
    test('writes_locally_only_when_the_text_changed', () async {
      when(() => api.open(_activityId)).thenAnswer((_) async => _view(text: 'Original'));
      await controller.open();

      await controller.saveLocalIfChanged();
      verifyNever(() => store.write(any(), any()));

      controller.setText('Original, edited.');
      await controller.saveLocalIfChanged();
      verify(() => store.write(_taskId, any())).called(1);
    });
  });

  group('saveServerIfChanged / submit', () {
    test('saves_to_the_server_only_when_the_text_changed_since_the_last_accepted_save', () async {
      when(() => api.open(_activityId)).thenAnswer((_) async => _view(text: 'Original', revision: 1));
      await controller.open();

      await controller.saveServerIfChanged();
      verifyNever(() => api.saveDraft(any(), text: any(named: 'text'), baseRevision: any(named: 'baseRevision'), activeSecondsDelta: any(named: 'activeSecondsDelta')));

      controller.setText('Original, edited.');
      when(() => api.saveDraft(_activityId, text: 'Original, edited.', baseRevision: 1, activeSecondsDelta: any(named: 'activeSecondsDelta')))
          .thenAnswer((_) async => WritingDraftSaved(revision: 2, savedAt: DateTime.parse('2026-10-02T08:43:00.000Z')));

      await controller.saveServerIfChanged();

      expect(controller.revision.value, 2);
      expect(controller.saveState.value, WritingSaveState.saved);
    });

    test('a_conflict_response_enters_the_conflict_state_and_pauses_autosave', () async {
      when(() => api.open(_activityId)).thenAnswer((_) async => _view(text: 'Original', revision: 1));
      await controller.open();
      controller.setText('My conflicting edit.');

      when(() => api.saveDraft(_activityId, text: any(named: 'text'), baseRevision: any(named: 'baseRevision'), activeSecondsDelta: any(named: 'activeSecondsDelta')))
          .thenThrow(
        const ApiException(
          cause: ApiFailureCause.other,
          message: 'This draft was updated on another device.',
          code: 'WRIT004',
          details: {
            'draft': {'text': 'Server wins', 'revision': 9, 'savedAt': null},
          },
        ),
      );

      await controller.saveServerIfChanged();

      expect(controller.conflict.value, isNotNull);
      expect(controller.text.value, 'Server wins');
      expect(controller.localVersionText.value, 'My conflicting edit.');

      clearInteractions(api);
      await controller.saveServerIfChanged();
      verifyNever(() => api.saveDraft(any(), text: any(named: 'text'), baseRevision: any(named: 'baseRevision'), activeSecondsDelta: any(named: 'activeSecondsDelta')));
    });

    test('a_failed_server_save_reports_saved_on_this_device', () async {
      when(() => api.open(_activityId)).thenAnswer((_) async => _view(text: 'Original', revision: 1));
      await controller.open();
      controller.setText('Edited while offline.');

      when(() => api.saveDraft(_activityId, text: any(named: 'text'), baseRevision: any(named: 'baseRevision'), activeSecondsDelta: any(named: 'activeSecondsDelta')))
          .thenThrow(const ApiException(cause: ApiFailureCause.noConnection, message: 'No connection'));

      await controller.saveServerIfChanged();

      expect(controller.saveState.value, WritingSaveState.localOnly);
      verify(() => store.write(_taskId, any())).called(1);
    });

    test('submit_flushes_then_submits_with_a_new_submission_id', () async {
      when(() => api.open(_activityId)).thenAnswer((_) async => _view(text: 'Original', revision: 1));
      await controller.open();
      controller.setText('Ninety words go here.');

      when(() => api.saveDraft(_activityId, text: 'Ninety words go here.', baseRevision: 1, activeSecondsDelta: any(named: 'activeSecondsDelta')))
          .thenAnswer((_) async => WritingDraftSaved(revision: 2, savedAt: DateTime.parse('2026-10-02T08:43:00.000Z')));
      when(() => api.submit(_activityId, submissionId: any(named: 'submissionId'), baseRevision: 2))
          .thenAnswer((_) async => _view(status: WritingTaskStatus.correcting, text: 'Ninety words go here.', revision: 2));

      final succeeded = await controller.submit();

      expect(succeeded, isTrue);
      expect(controller.view.value?.status, WritingTaskStatus.correcting);
      final captured = verify(() => api.submit(_activityId, submissionId: captureAny(named: 'submissionId'), baseRevision: 2)).captured;
      expect(captured.single, isA<String>());
      expect((captured.single as String).length, 36);
    });

    test('a_conflict_during_the_flush_aborts_the_submit_instead_of_using_a_stale_revision', () async {
      when(() => api.open(_activityId)).thenAnswer((_) async => _view(text: 'Original', revision: 1));
      await controller.open();
      controller.setText('Edited text.');

      when(() => api.saveDraft(_activityId, text: any(named: 'text'), baseRevision: any(named: 'baseRevision'), activeSecondsDelta: any(named: 'activeSecondsDelta')))
          .thenThrow(
        const ApiException(
          cause: ApiFailureCause.other,
          message: 'This draft was updated on another device.',
          code: 'WRIT004',
          details: {
            'draft': {'text': 'Server wins', 'revision': 9, 'savedAt': null},
          },
        ),
      );

      final succeeded = await controller.submit();

      expect(succeeded, isFalse);
      expect(controller.conflict.value, isNotNull);
      verifyNever(() => api.submit(any(), submissionId: any(named: 'submissionId'), baseRevision: any(named: 'baseRevision')));
    });
  });

  group('flushOnPause / reconcileOnResume', () {
    test('flushes_locally_and_to_the_server_on_pause', () async {
      when(() => api.open(_activityId)).thenAnswer((_) async => _view(text: 'Original', revision: 1));
      await controller.open();
      controller.setText('Edited before pausing.');

      when(() => api.saveDraft(_activityId, text: 'Edited before pausing.', baseRevision: 1, activeSecondsDelta: any(named: 'activeSecondsDelta')))
          .thenAnswer((_) async => WritingDraftSaved(revision: 2, savedAt: DateTime.parse('2026-10-02T08:43:00.000Z')));

      await controller.flushOnPause();

      verify(() => store.write(_taskId, any())).called(1);
      expect(controller.revision.value, 2);
      expect(controller.saveState.value, WritingSaveState.saved);
    });

    test('reconciles_on_resume_adopting_a_newer_untouched_server_copy', () async {
      when(() => api.open(_activityId)).thenAnswer((_) async => _view(text: 'Original', revision: 1));
      await controller.open();

      when(() => api.read(_activityId)).thenAnswer((_) async => _view(text: 'Newer from another device', revision: 5));

      await controller.reconcileOnResume();

      expect(controller.text.value, 'Newer from another device');
      expect(controller.revision.value, 5);
    });

    test('reconciles_on_resume_surfacing_a_conflict_with_unsynced_edits', () async {
      when(() => api.open(_activityId)).thenAnswer((_) async => _view(text: 'Original', revision: 1));
      await controller.open();
      controller.setText('My own unsynced edit.');

      when(() => api.read(_activityId)).thenAnswer((_) async => _view(text: 'Newer from another device', revision: 5));

      await controller.reconcileOnResume();

      expect(controller.conflict.value, isNotNull);
      expect(controller.conflict.value!.variant, DraftConflictVariant.conflict);
      expect(controller.localVersionText.value, 'My own unsynced edit.');
    });

    test('reconciles_on_resume_surfacing_submitted_elsewhere_rather_than_discarding_local_work', () async {
      when(() => api.open(_activityId)).thenAnswer((_) async => _view(text: 'Original', revision: 1));
      await controller.open();
      controller.setText('My own unsynced edit.');

      when(() => api.read(_activityId)).thenAnswer(
        (_) async => _view(
          status: WritingTaskStatus.corrected,
          text: 'Original',
          revision: 1,
          correction: WritingCorrectionView(
            correctedAt: DateTime.parse('2026-10-02T08:45:00.000Z'),
            overallComment: 'Nicely done.',
            scores: const [],
            text: const [],
            revision: const [],
            errors: const [],
            errorGroups: const [],
          ),
        ),
      );

      await controller.reconcileOnResume();

      expect(controller.conflict.value, isNotNull);
      expect(controller.conflict.value!.variant, DraftConflictVariant.submittedElsewhere);
      expect(controller.localVersionText.value, 'My own unsynced edit.');
      // The view has not yet switched to the settled one — the banner owns the screen until dismissed.
      expect(controller.view.value?.status, WritingTaskStatus.draft);

      await controller.continueWithConflict();

      expect(controller.conflict.value, isNull);
      expect(controller.view.value?.status, WritingTaskStatus.corrected);
    });
  });

  group('continueWithConflict', () {
    test('a_plain_conflict_adopts_the_servers_copy_and_unlocks_editing', () async {
      when(() => api.open(_activityId)).thenAnswer((_) async => _view(text: 'Server text', revision: 5));
      when(() => store.read(_taskId)).thenAnswer(
        (_) async => LocalWritingDraft(text: 'Local stale text', baseRevision: 3, editedAt: DateTime.now(), pendingActiveSeconds: 0),
      );
      await controller.open();
      expect(controller.conflict.value, isNotNull);

      await controller.continueWithConflict();

      expect(controller.conflict.value, isNull);
      expect(controller.localVersionText.value, isNull);
      expect(controller.text.value, 'Server text');
      expect(controller.revision.value, 5);
      expect(controller.saveState.value, WritingSaveState.saved);
      verify(() => store.clear(_taskId)).called(greaterThanOrEqualTo(1));
    });
  });

  group('pollWhileCorrecting', () {
    test('polls_only_while_correcting_and_stops_once_settled', () async {
      when(() => api.open(_activityId)).thenAnswer((_) async => _view(status: WritingTaskStatus.correcting));
      await controller.open();
      expect(controller.isCorrecting, isTrue);

      when(() => api.read(_activityId)).thenAnswer((_) async => _view(status: WritingTaskStatus.corrected, correction: _emptyCorrection()));

      await controller.pollWhileCorrecting();

      expect(controller.isCorrecting, isFalse);

      clearInteractions(api);
      await controller.pollWhileCorrecting();
      verifyNever(() => api.read(any()));
    });
  });

  group('retryCorrection', () {
    test('resubmits_at_the_current_revision', () async {
      when(() => api.open(_activityId)).thenAnswer((_) async => _view(status: WritingTaskStatus.uncorrected, text: 'Saved text', revision: 2));
      await controller.open();

      when(() => api.submit(_activityId, submissionId: any(named: 'submissionId'), baseRevision: 2))
          .thenAnswer((_) async => _view(status: WritingTaskStatus.correcting, text: 'Saved text', revision: 2));

      final succeeded = await controller.retryCorrection();

      expect(succeeded, isTrue);
      expect(controller.view.value?.status, WritingTaskStatus.correcting);
    });
  });
}

WritingCorrectionView _emptyCorrection() => WritingCorrectionView(
  correctedAt: DateTime.parse('2026-10-02T08:45:00.000Z'),
  overallComment: 'Nicely done.',
  scores: const [],
  text: const [],
  revision: const [],
  errors: const [],
  errorGroups: const [],
);
