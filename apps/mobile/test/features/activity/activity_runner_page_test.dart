import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/audio/audio_playback_service.dart';
import 'package:mobile/features/activity/activities_api.dart';
import 'package:mobile/features/activity/activity_draft_store.dart';
import 'package:mobile/features/activity/activity_runner_page.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/pump_screen.dart';
import '../../helpers/scripted_dio.dart';
import 'activity_fixtures.dart';

class FakePlayback implements AudioPlayback {
  FakePlayback({this.failToLoad = false});

  final bool failToLoad;
  final _position = StreamController<Duration>.broadcast();
  final _playing = StreamController<bool>.broadcast();
  final _completed = StreamController<void>.broadcast();
  var plays = 0;

  @override
  Future<Duration?> load(Uri uri, {Map<String, String>? headers}) async {
    if (failToLoad) throw Exception('cannot load');
    return const Duration(seconds: 125);
  }

  @override
  Future<void> play() async {
    plays += 1;
    _playing.add(true);
  }

  @override
  Future<void> pause() async => _playing.add(false);

  @override
  Future<void> seek(Duration position) async => _position.add(position);

  @override
  Stream<Duration> get positionStream => _position.stream;

  @override
  Stream<bool> get playingStream => _playing.stream;

  @override
  Stream<void> get completedStream => _completed.stream;

  @override
  Future<void> dispose() async {}
}

Widget page(Dio dio, {FakePlayback? playback, void Function(String)? onNavigate}) => ActivityRunnerPage(
  activityId: activityId,
  api: ActivitiesApi(dio),
  store: ActivityDraftStore(),
  mediaHeaders: const {},
  playbackFactory: () => playback ?? FakePlayback(),
  onNavigate: onNavigate,
  retryDelays: const [Duration(hours: 1)],
);

Future<void> tapText(WidgetTester tester, String text) async {
  final finder = find.text(text);
  await tester.ensureVisible(finder.first);
  await tester.pumpAndSettle();
  await tester.tap(finder.first);
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('shows_one_question_with_the_passage_and_the_next_action_on_a_small_phone', (tester) async {
    final (dio, _) = scriptedDio({'GET /activities/$activityId': ok(viewJson())});

    await pumpOnSmallPhone(tester, page(dio));

    expect(find.text('Question 1 of 5'), findsOneWidget);
    expect(find.text('Question 2 of 5'), findsNothing);
    expect(find.textContaining('Had the council listened'), findsOneWidget);
    expect(find.text('Activity 1 of 2'), findsOneWidget);
    expect(find.text('Next question'), findsOneWidget);
    expect(find.byTooltip('Close activity'), findsOneWidget);
    expect(find.text('Skip'), findsOneWidget);
  });

  testWidgets('survives_large_text_on_a_small_phone', (tester) async {
    final (dio, _) = scriptedDio({'GET /activities/$activityId': ok(viewJson())});

    await pumpOnSmallPhone(tester, page(dio), textScale: 1.3);

    expect(tester.takeException(), isNull);
    expect(find.text('Next question'), findsOneWidget);
  });

  testWidgets('answering_every_question_submits_and_shows_the_results', (tester) async {
    final (dio, adapter) = scriptedDio({
      'GET /activities/$activityId': ok(viewJson()),
      'POST /activities/$activityId/attempts': ok(viewJson(state: 'in_progress', attempt: openAttemptJson())),
      'PUT /activities/$activityId/attempts/$attemptId/submission': ok(submittedViewJson()),
    });
    await pumpOnSmallPhone(tester, page(dio));

    await tapText(tester, 'The council');
    await tapText(tester, 'Next question');
    expect(find.text('Question 2 of 5'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'had heard');
    await tester.pumpAndSettle();
    await tapText(tester, 'Next question');
    await tapText(tester, 'Exasperated');
    await tapText(tester, 'Next question');
    await tester.enterText(find.byType(TextField), 'Had');
    await tester.pumpAndSettle();
    await tapText(tester, 'Next question');
    await tapText(tester, 'B');
    expect(find.text('Submit answers'), findsOneWidget);
    await tapText(tester, 'Submit answers');

    expect(find.text('3 of 4 correct'), findsOneWidget);
    expect(find.text("1 question wasn't scored."), findsOneWidget);
    expect(adapter.requests.where((request) => request.method == 'PUT'), hasLength(1));
    expect(tester.takeException(), isNull);
  });

  testWidgets('results_expand_incorrect_questions_and_show_the_correction_and_the_rating_prompt', (tester) async {
    final (dio, _) = scriptedDio({'GET /activities/$activityId': ok(submittedViewJson())});
    final paths = <String>[];
    await pumpOnSmallPhone(tester, page(dio, onNavigate: paths.add));

    expect(find.text('3 of 4 correct'), findsOneWidget);
    expect(find.text('Question 2: Incorrect'), findsOneWidget);
    expect(find.text('Your answer: would have heard'), findsOneWidget);
    expect(find.text('Correct answer: had listened to'), findsOneWidget);
    expect(find.text('Also accepted: had heard'), findsOneWidget);
    expect(find.text('Paragraph two.'), findsNothing);
    await tapText(tester, 'Question 1: Correct');
    expect(find.text('Paragraph two.'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('How was this activity?'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('Just right'), findsOneWidget);
    await tapText(tester, 'Next activity');
    expect(paths, ['/activity/$otherActivityId']);
  });

  testWidgets('the_results_view_survives_large_text', (tester) async {
    final (dio, _) = scriptedDio({'GET /activities/$activityId': ok(submittedViewJson())});
    await pumpOnSmallPhone(tester, page(dio), textScale: 1.3);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a_finished_session_leads_back_to_today', (tester) async {
    final (dio, _) = scriptedDio({
      'GET /activities/$activityId': ok(
        submittedViewJson(session: [planEntryJson(state: 'completed'), planEntryJson(id: otherActivityId, position: 2, kind: 'grammar', state: 'completed')]),
      ),
    });
    final paths = <String>[];
    await pumpOnSmallPhone(tester, page(dio, onNavigate: paths.add));

    await tester.scrollUntilVisible(find.text('Back to Today'), 300, scrollable: find.byType(Scrollable).first);
    await tapText(tester, 'Back to Today');
    expect(paths, ['/app/today']);
  });

  testWidgets('skip_asks_for_a_reason_and_leaves_for_the_next_step', (tester) async {
    final (dio, adapter) = scriptedDio({
      'GET /activities/$activityId': ok(viewJson()),
      'POST /activities/$activityId/skip': ok(
        viewJson(state: 'skipped', session: [planEntryJson(state: 'skipped'), planEntryJson(id: otherActivityId, position: 2, kind: 'grammar')]),
      ),
    });
    final paths = <String>[];
    await pumpOnSmallPhone(tester, page(dio, onNavigate: paths.add));

    await tapText(tester, 'Skip');
    for (final preset in ['Not relevant to me', 'Too difficult right now', 'Not enough time today', "Something isn't working", 'Other']) {
      expect(find.text(preset), findsOneWidget);
    }
    await tapText(tester, 'Too difficult right now');
    await tapText(tester, 'Skip activity');

    expect(adapter.requests.last.data, {'reason': 'Too difficult right now'});
    expect(paths, ['/activity/$otherActivityId']);
  });

  testWidgets('a_failed_audio_load_shows_the_message_and_hides_the_questions', (tester) async {
    final (dio, adapter) = scriptedDio({
      'GET /activities/$activityId': ok(viewJson(kind: 'listening', passage: null, hasAudio: true)),
    });
    await pumpOnSmallPhone(tester, page(dio, playback: FakePlayback(failToLoad: true)));

    expect(find.text('This audio could not be loaded.'), findsOneWidget);
    expect(find.text('Question 1 of 5'), findsNothing);
    expect(find.text('Transcript'), findsNothing);
    expect(adapter.requests.where((request) => request.method == 'POST'), isEmpty);
  });

  testWidgets('listening_shows_the_player_and_withholds_the_transcript', (tester) async {
    final (dio, _) = scriptedDio({'GET /activities/$activityId': ok(viewJson(kind: 'listening', passage: null, hasAudio: true))});
    await pumpOnSmallPhone(tester, page(dio));

    expect(find.text('Listen'), findsOneWidget);
    expect(find.text('The transcript appears after you submit.'), findsOneWidget);
    expect(find.text('Play'), findsOneWidget);
    expect(find.text('2:05', findRichText: true), findsNothing);
    expect(find.textContaining('/ 2:05'), findsOneWidget);
    expect(find.text('Question 1 of 5'), findsOneWidget);
  });

  testWidgets('a_skipped_or_unrunnable_activity_shows_its_terminal_state', (tester) async {
    final (dio, _) = scriptedDio({'GET /activities/$activityId': ok(viewJson(state: 'skipped', skipReason: 'Not relevant to me'))});
    await pumpOnSmallPhone(tester, page(dio));
    expect(find.textContaining('You skipped this activity.'), findsOneWidget);
    expect(find.textContaining('Not relevant to me'), findsOneWidget);
    expect(find.text('Back to Today'), findsOneWidget);
  });

  testWidgets('a_load_failure_offers_a_retry', (tester) async {
    final (dio, _) = scriptedDio({'GET /activities/$activityId': offline()});
    await pumpOnSmallPhone(tester, page(dio));
    expect(find.text('No connection'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });
}
