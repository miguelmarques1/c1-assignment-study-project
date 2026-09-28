import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/plan/plan_models.dart';

import 'fixtures.dart';

void main() {
  test('parses_a_full_current_plan_view', () {
    final view = CurrentPlanView.fromJson({
      'serverTime': '2026-09-25T14:00:00.000Z',
      'plan': planJson(),
      'preparing': null,
      'failure': null,
    });

    expect(view.plan!.status, StudyPlanStatus.active);
    expect(view.plan!.origin, StudyPlanOrigin.lesson);
    expect(view.plan!.sessions, hasLength(7));
    expect(view.plan!.notes.single.text, 'Built from general C1 material.');
    expect(view.plan!.focusTags.single.label, 'Present perfect');
    final activity = view.plan!.sessions.first.activities.single;
    expect(activity.kind, PlanActivityKind.listening);
    expect(activity.state, PlanActivityState.pending);
    expect(activity.contentItemId, 'c1');
    expect(activity.targetTags.single.tag, 'grammar:present_perfect');
  });

  test('a_preparing_build_carries_its_progress', () {
    final view = CurrentPlanView.fromJson({
      'serverTime': '2026-09-25T14:00:00.000Z',
      'plan': null,
      'preparing': {
        'lessonId': 'l1',
        'origin': 'lesson',
        'since': '2026-09-25T13:00:00.000Z',
        'progress': {'done': 4, 'total': 12},
      },
      'failure': null,
    });

    expect(view.plan, isNull);
    expect(view.preparing!.progressDone, 4);
    expect(view.preparing!.progressTotal, 12);
    expect(view.preparing!.origin, StudyPlanOrigin.lesson);
  });

  test('a_fresh_user_gets_an_all_null_view', () {
    final view = CurrentPlanView.fromJson({'serverTime': '2026-09-25T14:00:00.000Z', 'plan': null, 'preparing': null, 'failure': null});

    expect(view.plan, isNull);
    expect(view.preparing, isNull);
    expect(view.failure, isNull);
  });

  test('a_failed_build_carries_the_message_and_stays_retryable', () {
    final view = CurrentPlanView.fromJson({
      'serverTime': '2026-09-25T14:00:00.000Z',
      'plan': null,
      'preparing': null,
      'failure': {
        'lessonId': 'l1',
        'origin': 'lesson',
        'failedAt': '2026-09-25T13:00:00.000Z',
        'message': 'We could not build a new plan.',
        'retryable': true,
      },
    });

    expect(view.failure!.message, 'We could not build a new plan.');
    expect(view.failure!.retryable, isTrue);
  });

  test('an_unknown_kind_falls_back_instead_of_crashing', () {
    final activity = PlanActivityView.fromJson(activityJson(kind: 'future_kind'));
    expect(activity.kind, PlanActivityKind.listening);
  });

  test('history_lists_active_and_archived_plans', () {
    final view = PlanHistoryView.fromJson({
      'plans': [
        {
          'id': 'p1',
          'status': 'active',
          'origin': 'lesson',
          'lessonId': 'l1',
          'lessonDate': '2026-09-20T10:00:00.000Z',
          'createdAt': '2026-09-20T10:00:00.000Z',
          'activatedAt': '2026-09-20T10:00:00.000Z',
          'archivedAt': null,
          'summaryLine': '7 sessions · 21 activities',
          'activityCount': 21,
          'completedCount': 5,
          'skippedCount': 0,
          'completionPercent': 24,
          'ratings': {'tooEasy': 0, 'justRight': 1, 'tooHard': 0, 'notUseful': 0},
        },
      ],
    });

    expect(view.plans.single.status, StudyPlanStatus.active);
    expect(view.plans.single.completionPercent, 24);
    expect(view.plans.single.ratings.justRight, 1);
  });

  test('carried_over_and_review_activities_and_a_recorded_rating', () {
    final activity = PlanActivityView.fromJson(activityJson(carriedOver: true, isReview: true, rating: 'too_hard'));
    expect(activity.carriedOver, isTrue);
    expect(activity.isReview, isTrue);
    expect(activity.rating, DifficultyRating.tooHard);
  });
}
