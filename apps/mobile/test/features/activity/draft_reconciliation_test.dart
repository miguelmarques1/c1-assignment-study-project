import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/activity/activity_draft_store.dart';
import 'package:mobile/features/activity/activity_models.dart';
import 'package:mobile/features/activity/activity_navigation.dart';
import 'package:mobile/features/activity/draft_reconciliation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'activity_fixtures.dart';

ActivityDraft draft({String? attempt = attemptId, String? print, bool pending = false, String savedAt = '2026-10-02T07:40:00.000Z'}) => ActivityDraft(
  activityId: activityId,
  attemptId: attempt,
  fingerprint: print ?? fingerprint,
  answers: const [ObjectiveAnswer.choice(index: 0, optionIndex: 1), ObjectiveAnswer.text(index: 1, text: 'had heard')],
  activeSeconds: 42,
  pendingSubmission: pending,
  savedAt: savedAt,
);

ActivityView openView({String? print}) =>
    ActivityView.fromJson(viewJson(state: 'in_progress', attempt: openAttemptJson(), fingerprintOverride: print));

void main() {
  group('reconcileDraft', () {
    test('submitted_on_the_server_discards_the_draft', () {
      expect(reconcileDraft(ActivityView.fromJson(submittedViewJson()), draft()), isA<ShowResults>());
    });

    test('a_skipped_activity_discards_the_draft', () {
      expect(reconcileDraft(ActivityView.fromJson(viewJson(state: 'skipped')), draft()), isA<ShowUnavailable>());
      expect(reconcileDraft(ActivityView.fromJson(viewJson(readOnly: true)), draft()), isA<ShowUnavailable>());
    });

    test('a_matching_attempt_restores', () {
      final outcome = reconcileDraft(openView(), draft()) as RestoreDraft;
      expect(outcome.attemptId, attemptId);
      expect(outcome.resumeSubmit, isFalse);
    });

    test('a_draft_without_attempt_adopts_the_open_one', () {
      final outcome = reconcileDraft(openView(), draft(attempt: null)) as RestoreDraft;
      expect(outcome.attemptId, attemptId);
      expect(outcome.draft.attemptId, attemptId);
    });

    test('with_no_attempt_a_draft_without_one_restores_and_a_stale_one_is_discarded', () {
      final fresh = ActivityView.fromJson(viewJson());
      expect(reconcileDraft(fresh, draft(attempt: null)), isA<RestoreDraft>());
      final stale = reconcileDraft(fresh, draft()) as StartFresh;
      expect(stale.attemptId, isNull);
      expect(stale.notice, isNull);
    });

    test('a_stale_attempt_id_discards', () {
      final outcome = reconcileDraft(openView(), draft(attempt: 'b1b2b3b4-0000-4000-8000-000000000000')) as StartFresh;
      expect(outcome.attemptId, attemptId);
      expect(outcome.notice, isNull);
    });

    test('a_changed_fingerprint_discards_with_a_notice', () {
      final outcome = reconcileDraft(openView(print: 'e' * 64), draft()) as StartFresh;
      expect(outcome.notice, draftUpdatedNotice);
    });

    test('a_pending_submission_resumes_sending', () {
      expect((reconcileDraft(openView(), draft(pending: true)) as RestoreDraft).resumeSubmit, isTrue);
    });

    test('no_draft_starts_fresh_on_the_open_attempt', () {
      expect((reconcileDraft(openView(), null) as StartFresh).attemptId, attemptId);
    });
  });

  test('opens_on_the_first_unanswered_scored_question', () {
    final questions = ActivityView.fromJson(viewJson()).objective!.item.questions;
    expect(firstUnansweredIndex(questions, const []), 0);
    expect(firstUnansweredIndex(questions, draft().answers), 2);
    expect(firstUnansweredIndex(questions, [for (var i = 0; i < 5; i++) ObjectiveAnswer.choice(index: i, optionIndex: 0)]), 4);
  });

  group('nextStep', () {
    ActivityView session(List<Map<String, Object?>> entries) => ActivityView.fromJson(viewJson(session: entries));

    test('next_is_the_first_unfinished_other_activity', () {
      final step = nextStep(
        session([
          planEntryJson(state: 'completed'),
          planEntryJson(id: otherActivityId, position: 2, kind: 'grammar'),
          planEntryJson(id: 'x1', position: 3, kind: 'writing'),
        ]),
      );
      expect(step.isNext, isTrue);
      expect(step.path, '/activity/$otherActivityId');
      expect(step.label, 'Next activity');
    });

    test('a_finished_session_leads_back_to_today', () {
      final step = nextStep(session([planEntryJson(state: 'completed'), planEntryJson(id: otherActivityId, position: 2, kind: 'grammar', state: 'skipped')]));
      expect(step.isNext, isFalse);
      expect(step.path, '/app/today');
      expect(step.label, 'Back to Today');
    });
  });

  group('ActivityDraftStore', () {
    setUp(() => SharedPreferences.setMockInitialValues({}));

    test('round_trips_and_clears_a_draft', () async {
      final store = ActivityDraftStore();
      await store.save(draft());
      final loaded = await store.load([activityId]);
      expect(loaded!.answers, hasLength(2));
      expect(loaded.answers[1].text, 'had heard');
      await store.clear([activityId]);
      expect(await store.load([activityId]), isNull);
    });

    test('corrupt_json_is_discarded_not_trusted', () async {
      SharedPreferences.setMockInitialValues({ActivityDraftStore.keyOf(activityId): '{not json'});
      final store = ActivityDraftStore();
      expect(await store.load([activityId]), isNull);
      expect((await SharedPreferences.getInstance()).getString(ActivityDraftStore.keyOf(activityId)), isNull);
    });

    test('a_platform_exception_never_throws', () async {
      final store = ActivityDraftStore(prefsProvider: () async => throw Exception('denied'));
      expect(await store.load([activityId]), isNull);
      await store.save(draft());
      await store.clear([activityId]);
    });

    test('finds_the_newest_draft_in_the_lineage', () async {
      final store = ActivityDraftStore();
      await store.save(ActivityDraft(activityId: 'old', attemptId: null, fingerprint: fingerprint, answers: const [], activeSeconds: 1, pendingSubmission: false, savedAt: '2026-10-01T00:00:00.000Z'));
      await store.save(draft(savedAt: '2026-10-02T00:00:00.000Z'));
      expect((await store.load(['old', activityId]))!.activityId, activityId);
    });
  });
}
