import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/speaking/speaking_api.dart';
import 'package:mobile/features/speaking/speaking_page.dart';

import '../../helpers/pump_screen.dart';
import '../../helpers/scripted_dio.dart';

const activityId = 'activity-1';

Map<String, Object?> _activityJson({String? block, int attemptsRemaining = 3, List<Map<String, Object?>> attempts = const []}) => {
  'activityId': activityId,
  'kind': 'speaking',
  'title': 'Talk about your weekend',
  'state': 'pending',
  'planStatus': 'active',
  'estimatedMinutes': 6,
  'targetTags': <Map<String, Object?>>[],
  'task': {
    'shape': 'open_response',
    'referenceText': null,
    'prompt': 'What did you do last weekend?',
    'hint': 'Mention at least two activities.',
    'wordCount': null,
    'focusTags': <Map<String, Object?>>[
      {'tag': 'discourse:sequencing', 'label': 'Sequencing words'},
    ],
    'targetSeconds': {'min': 30, 'max': 90},
  },
  'block': block,
  'limits': {'maxAttempts': 3, 'maxRecordingSeconds': 120, 'minRecognizedWords': 10},
  'attemptsUsed': 3 - attemptsRemaining,
  'attemptsRemaining': attemptsRemaining,
  'bestAttemptId': null,
  'attempts': attempts,
  'rating': null,
};

void main() {
  testWidgets('shows_the_task_and_the_record_button_on_a_small_phone', (tester) async {
    final (dio, _) = scriptedDio({'GET /speaking/activities/$activityId': ok(_activityJson())});

    await pumpOnSmallPhone(tester, SpeakingPage(activityId: activityId, api: SpeakingApi(dio)));

    expect(find.text('Talk about your weekend'), findsOneWidget);
    expect(find.text('What did you do last weekend?'), findsOneWidget);
    expect(find.text('Record'), findsOneWidget);
    expect(find.text('Attempt 1 of 3'), findsOneWidget);
  });

  testWidgets('survives_large_text_on_a_small_phone', (tester) async {
    final (dio, _) = scriptedDio({'GET /speaking/activities/$activityId': ok(_activityJson())});

    await pumpOnSmallPhone(tester, SpeakingPage(activityId: activityId, api: SpeakingApi(dio)), textScale: 1.3);

    expect(tester.takeException(), isNull);
  });

  testWidgets('shows_the_azure_key_gate_instead_of_the_recorder', (tester) async {
    final (dio, _) = scriptedDio({'GET /speaking/activities/$activityId': ok(_activityJson(block: 'azure_key_missing'))});

    await pumpOnSmallPhone(tester, SpeakingPage(activityId: activityId, api: SpeakingApi(dio)));

    expect(find.text('Add your Azure Speech key to use speaking activities.'), findsOneWidget);
    expect(find.text('Record'), findsNothing);
  });

  testWidgets('shows_a_read_only_view_when_the_plan_is_archived', (tester) async {
    final (dio, _) = scriptedDio({'GET /speaking/activities/$activityId': ok(_activityJson(block: 'plan_archived'))});

    await pumpOnSmallPhone(tester, SpeakingPage(activityId: activityId, api: SpeakingApi(dio)));

    expect(find.text('This activity is no longer in your current plan.'), findsOneWidget);
    expect(find.text('Record'), findsNothing);
    expect(find.text('How was this activity?'), findsNothing);
  });

  testWidgets('shows_all_attempts_used_once_the_limit_is_reached', (tester) async {
    final (dio, _) = scriptedDio({'GET /speaking/activities/$activityId': ok(_activityJson(attemptsRemaining: 0))});

    await pumpOnSmallPhone(tester, SpeakingPage(activityId: activityId, api: SpeakingApi(dio)));

    expect(find.text('All 3 attempts used. Your best score counts.'), findsOneWidget);
    expect(find.text('Record'), findsNothing);
  });
}
