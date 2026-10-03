import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/plan/plan_models.dart';
import 'package:mobile/features/settings/credential_models.dart';
import 'package:mobile/features/speaking/widgets/pronunciation_practice_card.dart';

import '../../helpers/pump_screen.dart';

PlanActivityView _activity({
  required String id,
  required int day,
  required int position,
  required PlanActivityKind kind,
  PlanActivityState state = PlanActivityState.pending,
  String title = 'Activity',
  int estimatedMinutes = 6,
}) => PlanActivityView(
  id: id,
  day: day,
  position: position,
  kind: kind,
  contentItemId: null,
  title: title,
  estimatedMinutes: estimatedMinutes,
  targetTags: const [],
  rationale: 'Because it is due.',
  isReview: false,
  carriedOver: false,
  state: state,
  startedAt: null,
  completedAt: null,
  skippedAt: null,
  skipReason: null,
  rating: null,
  notUseful: false,
);

PlanSessionView _session(int day, List<PlanActivityView> activities) => PlanSessionView(
  day: day,
  estimatedMinutes: 17,
  state: PlanSessionState.notStarted,
  completedAt: null,
  summary: const PlanSessionSummary(completed: 0, skipped: 0, correct: null, questions: null, timeSpentSeconds: null),
  activities: activities,
);

StudyPlanView _plan(List<PlanSessionView> sessions) => StudyPlanView(
  id: 'plan-1',
  status: StudyPlanStatus.active,
  origin: StudyPlanOrigin.lesson,
  lessonId: 'lesson-1',
  lessonDate: DateTime(2026, 9, 20),
  createdAt: DateTime(2026, 9, 20),
  activatedAt: DateTime(2026, 9, 20),
  archivedAt: null,
  summaryLine: '7 sessions',
  focusTags: const [],
  notes: const [],
  progress: const PlanProgress(total: 21, completed: 0, skipped: 0, inProgress: 0, pending: 21, completionPercent: 0),
  ratings: const PlanRatingCounts(tooEasy: 0, justRight: 0, tooHard: 0, notUseful: 0),
  sessions: sessions,
);

List<PlanSessionView> _sevenSessions(List<PlanActivityView> Function(int day) activitiesFor) =>
    List.generate(7, (i) => _session(i + 1, activitiesFor(i + 1)));

MaskedCredential _validAzureCredential() => const MaskedCredential(
  provider: CredentialProvider.azureSpeech,
  status: CredentialStatus.valid,
  maskedKey: '••••abcd',
  region: 'brazilsouth',
  lastValidatedAt: null,
);

void main() {
  testWidgets('shows_the_no_plan_message_with_no_action', (tester) async {
    await pumpOnSmallPhone(
      tester,
      const Scaffold(body: PronunciationPracticeCard(plan: null, credentials: [])),
    );

    expect(find.textContaining('Read-aloud and speaking practice appear in your study plan'), findsOneWidget);
    expect(find.byType(TextButton), findsNothing);
  });

  testWidgets('asks_for_the_azure_key_before_offering_an_activity', (tester) async {
    final sessions = _sevenSessions(
      (day) => [_activity(id: 'a$day', day: day, position: 1, kind: PlanActivityKind.speaking)],
    );

    await pumpOnSmallPhone(
      tester,
      Scaffold(body: PronunciationPracticeCard(plan: _plan(sessions), credentials: const [])),
    );

    expect(find.text('Add your Azure Speech key to use speaking activities.'), findsOneWidget);
    expect(find.text('Practice now'), findsNothing);
  });

  testWidgets('links_to_the_earliest_unfinished_speaking_activity', (tester) async {
    final sessions = _sevenSessions((day) {
      if (day == 1) {
        return [_activity(id: 'done', day: 1, position: 1, kind: PlanActivityKind.listening, state: PlanActivityState.completed)];
      }
      if (day == 2) {
        return [
          _activity(id: 'later', day: 2, position: 2, kind: PlanActivityKind.speaking, title: 'Speak: Ordering coffee', estimatedMinutes: 8),
          _activity(id: 'earlier', day: 2, position: 1, kind: PlanActivityKind.pronunciation, title: 'Read aloud: /θ/', estimatedMinutes: 4),
        ];
      }
      return [_activity(id: 'x$day', day: day, position: 1, kind: PlanActivityKind.listening)];
    });

    String? openedPath;
    await pumpOnSmallPhone(
      tester,
      Scaffold(
        body: PronunciationPracticeCard(
          plan: _plan(sessions),
          credentials: [_validAzureCredential()],
          onOpenActivity: (path) => openedPath = path,
        ),
      ),
    );

    expect(find.text('Read aloud: /θ/'), findsOneWidget);
    expect(find.text('4 min'), findsOneWidget);
    await tester.tap(find.text('Practice now'));
    expect(openedPath, '/app/speaking/earlier');
  });

  testWidgets('shows_everything_done_when_no_speaking_activity_remains', (tester) async {
    final sessions = _sevenSessions(
      (day) => [_activity(id: 'a$day', day: day, position: 1, kind: PlanActivityKind.speaking, state: PlanActivityState.completed)],
    );
    var sawFullPlan = false;

    await pumpOnSmallPhone(
      tester,
      Scaffold(
        body: PronunciationPracticeCard(
          plan: _plan(sessions),
          credentials: [_validAzureCredential()],
          onSeeFullPlan: () => sawFullPlan = true,
        ),
      ),
    );

    expect(find.text('Every speaking activity in this plan is done.'), findsOneWidget);
    await tester.tap(find.text('See the full plan'));
    expect(sawFullPlan, isTrue);
  });
}
