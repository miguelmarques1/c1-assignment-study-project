import 'package:dio/dio.dart';
import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_modular/flutter_modular.dart';
import 'package:get/get.dart';

import '../../core/audio/audio_playback_service.dart';
import '../../core/connectivity/connectivity_service.dart';
import '../../core/network/api_exception.dart';
import '../../core/session/session_store.dart';
import '../../design/widgets/eq_audio_player.dart';
import '../../design/widgets/eq_button.dart';
import '../../design/widgets/eq_page_state.dart';
import '../plan/plan_models.dart';
import 'active_time_tracker.dart';
import 'activities_api.dart';
import 'activity_draft_store.dart';
import 'activity_models.dart';
import 'activity_navigation.dart';
import 'objective_runner_controller.dart';
import 'widgets/activity_unavailable.dart';
import 'widgets/palette.dart';
import 'widgets/passage_pane.dart';
import 'widgets/question_widgets.dart';
import 'widgets/rating_prompt.dart';
import 'widgets/results_view.dart';
import 'widgets/session_progress.dart';
import 'widgets/skip_activity_sheet.dart';
import 'widgets/submission_status.dart';

/// The full-screen runner for the five bank-backed kinds (A21): outside the
/// `/app` shell, so there is no bottom navigation. A session progress bar,
/// the passage or audio on top (about 45% of the height, scrolling on its
/// own), one question at a time below it, and the primary action pinned in
/// the thumb zone. No mockup covers this screen; it is composed from the
/// design-system widgets and mirrors the web's `objective-runner.tsx`.
class ActivityRunnerPage extends StatefulWidget {
  const ActivityRunnerPage({
    super.key,
    required this.activityId,
    this.api,
    this.store,
    this.playbackFactory,
    this.connectivity,
    this.time,
    this.retryDelays = defaultRetryDelays,
    this.mediaHeaders,
    this.onNavigate,
    this.onClose,
  });

  final String activityId;
  final ActivitiesApi? api;
  final ActivityDraftStore? store;
  final AudioPlayback Function()? playbackFactory;
  final ConnectivityService? connectivity;
  final ActiveTimeTracker? time;
  final List<Duration> retryDelays;

  /// Extra headers for the audio stream (tests); the app reads the bearer token from the session.
  final Map<String, String>? mediaHeaders;

  /// Tests observe navigation here; the app navigates with Modular.
  final void Function(String path)? onNavigate;
  final VoidCallback? onClose;

  @override
  State<ActivityRunnerPage> createState() => _ActivityRunnerPageState();
}

class _ActivityRunnerPageState extends State<ActivityRunnerPage> {
  late final ActivitiesApi _api = widget.api ?? ActivitiesApi(inject<Dio>());
  late final ObjectiveRunnerController _controller = ObjectiveRunnerController(
    _api,
    widget.store ?? ActivityDraftStore(),
    widget.activityId,
    time: widget.time,
    connectivity: widget.connectivity,
    retryDelays: widget.retryDelays,
  );
  AudioPlayback? _playback;
  Map<String, String>? _mediaHeaders;

  @override
  void initState() {
    super.initState();
    _prepare();
  }

  Future<void> _prepare() async {
    _mediaHeaders = widget.mediaHeaders;
    if (_mediaHeaders == null) {
      try {
        final token = await inject<SessionStore>().readToken();
        if (token != null) _mediaHeaders = {'Authorization': 'Bearer $token'};
      } catch (_) {
        // No session in a bare test harness: the stream just carries no header.
      }
    }
    await _controller.load();
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _controller.onClose();
    _playback?.dispose();
    super.dispose();
  }

  void _go(String path) {
    final navigate = widget.onNavigate;
    if (navigate != null) {
      navigate(path);
    } else {
      context.navigate(path);
    }
  }

  void _close() {
    final onClose = widget.onClose;
    if (onClose != null) {
      onClose();
    } else if (Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    } else {
      _go(todayRoute);
    }
  }

  Future<void> _skip(String reason) async {
    final view = _controller.view.value!;
    try {
      final skipped = await _api.skip(view.activity.id, reason);
      await (widget.store ?? ActivityDraftStore()).clear(view.activity.lineage);
      _go(nextStep(skipped).path);
    } on ApiException catch (error) {
      throw Exception(error.message);
    }
  }

  bool _skippable(ActivityView view) =>
      !view.activity.readOnly &&
      (view.activity.state == PlanActivityState.pending || view.activity.state == PlanActivityState.inProgress);

  @override
  Widget build(BuildContext context) {
    final palette = EqPalette.of(context);

    return Scaffold(
      body: SafeArea(
        child: Obx(() {
          final error = _controller.loadError.value;
          if (!_controller.loaded.value) {
            return Padding(
              padding: EdgeInsets.all(EqSpacing.marginMobile),
              child: error != null ? EqError(cause: error.message, onRetry: _controller.load) : const EqLoading(blockCount: 4, blockHeight: 56),
            );
          }
          final view = _controller.view.value!;
          return Padding(
            padding: EdgeInsets.symmetric(horizontal: EqSpacing.marginMobile),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 560),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _header(view, palette),
                    SizedBox(height: EqSpacing.sm),
                    Expanded(child: _body(view, palette)),
                  ],
                ),
              ),
            ),
          );
        }),
      ),
    );
  }

  Widget _header(ActivityView view, EqPalette palette) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            IconButton(icon: const Icon(Icons.close), tooltip: 'Close activity', onPressed: _close),
            Expanded(
              child: Text(view.activity.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: EqTextStyles.titleMd(dark: palette.dark)),
            ),
            if (_skippable(view))
              TextButton(
                onPressed: () => showSkipActivitySheet(context, onSkip: _skip),
                child: const Text('Skip'),
              ),
          ],
        ),
        SessionProgress(session: view.session, currentId: view.activity.id),
      ],
    );
  }

  Widget _body(ActivityView view, EqPalette palette) {
    final phase = _controller.phase.value;

    if (phase == RunnerPhase.unavailable && _controller.unavailable.value != null) {
      return ListView(
        padding: EdgeInsets.symmetric(vertical: EqSpacing.md),
        children: [
          ActivityUnavailable(
            reason: _controller.unavailable.value!,
            skipReason: view.activity.skipReason,
            onGoToPlan: () => _go('/app/plan'),
            onGoToToday: () => _go(todayRoute),
          ),
        ],
      );
    }

    if (phase == RunnerPhase.results) {
      final step = _controller.next;
      return ListView(
        padding: EdgeInsets.symmetric(vertical: EqSpacing.md),
        children: [
          ResultsView(
            view: view,
            nextLabel: step.label,
            onNext: () => _go(step.path),
            rating: view.activity.state == PlanActivityState.completed
                ? RatingPrompt(
                    initialRating: view.activity.rating,
                    initialNotUseful: view.activity.notUseful,
                    onRate: ({required rating, required notUseful}) async {
                      try {
                        await _api.rate(view.activity.id, rating: rating, notUseful: notUseful);
                      } on ApiException catch (error) {
                        throw Exception(error.message);
                      }
                    },
                  )
                : null,
          ),
        ],
      );
    }

    return _answering(view, palette, phase);
  }

  Widget _answering(ActivityView view, EqPalette palette, RunnerPhase phase) {
    final objective = view.objective!;
    final item = objective.item;
    final listening = item.type == PlanActivityKind.listening;
    final questions = _controller.questions;
    final shown = _controller.viewing.value ?? _controller.index.value;
    final question = shown < questions.length ? questions[shown] : null;
    final answering = phase == RunnerPhase.answering;
    final reviewing = _controller.viewing.value != null;
    final locked = reviewing || !answering || (question != null && _controller.lockedAnswer(question) != null);
    final answer = question == null
        ? null
        : (locked
              ? _controller.lockedAnswer(question)
              : (_controller.pending.value?.index == question.index ? _controller.pending.value : null));

    Widget? top;
    if (listening) {
      _playback ??= (widget.playbackFactory ?? JustAudioPlayback.new)();
      top = DecoratedBox(
        decoration: palette.box(shadow: true),
        child: Padding(
          padding: EdgeInsets.all(EqSpacing.md),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Listen', style: EqTextStyles.labelLg(dark: palette.dark)),
              SizedBox(height: EqSpacing.sm),
              EqAudioPlayer(
                uri: _api.mediaUri(view.activity.id),
                playback: _playback!,
                headers: _mediaHeaders,
                onFirstPlay: _controller.onFirstPlay,
                onError: _controller.onAudioError,
                onRetry: _controller.onAudioRetry,
              ),
              SizedBox(height: EqSpacing.xs),
              Text('The transcript appears after you submit.', style: EqTextStyles.bodySm(dark: palette.dark)),
            ],
          ),
        ),
      );
    } else if (item.passage != null) {
      top = PassagePane(passage: item.passage!, maxHeight: MediaQuery.sizeOf(context).height * 0.3);
    }

    final String actionLabel = _controller.isLast ? 'Submit answers' : 'Next question';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (top != null) ...[top, SizedBox(height: EqSpacing.sm)],
        Expanded(
          child: ListView(
            padding: EdgeInsets.only(bottom: EqSpacing.md),
            children: [
              if (_controller.notice.value != null) ...[
                DecoratedBox(
                  decoration: palette.box(color: palette.infoBg, radius: EqRadius.md),
                  child: Padding(
                    padding: EdgeInsets.all(EqSpacing.md),
                    child: Text(_controller.notice.value!, style: EqTextStyles.bodyMd(dark: palette.dark).copyWith(color: palette.infoFg)),
                  ),
                ),
                SizedBox(height: EqSpacing.sm),
              ],
              if (!_controller.audioFailed.value) ...[
                QuestionDots(
                  questions: questions,
                  answers: _controller.answers,
                  current: _controller.index.value,
                  viewing: _controller.viewing.value,
                  onSelect: _controller.review,
                ),
                SizedBox(height: EqSpacing.md),
                if (question != null) _questionCard(question, shown, questions.length, answer, locked, palette),
                SizedBox(height: EqSpacing.sm),
                SubmissionStatus(phase: phase, onRetry: _controller.retryNow),
                if (reviewing) ...[
                  SizedBox(height: EqSpacing.sm),
                  EqButton(label: 'Back to the current question', variant: EqButtonVariant.neutral, onPressed: () => _controller.review(null)),
                ],
              ],
            ],
          ),
        ),
        if (answering && !reviewing && !_controller.audioFailed.value)
          Padding(
            padding: EdgeInsets.only(bottom: EqSpacing.md),
            child: EqButton(
              label: actionLabel,
              size: EqButtonSize.lg,
              onPressed: _controller.canConfirm ? _controller.confirm : null,
            ),
          ),
      ],
    );
  }

  Widget _questionCard(ObjectiveQuestion question, int position, int total, ObjectiveAnswer? answer, bool locked, EqPalette palette) {
    final Widget content = switch (question) {
      MultipleChoiceQuestion() => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(question.prompt!, style: EqTextStyles.titleMd(dark: palette.dark)),
          SizedBox(height: EqSpacing.md),
          MultipleChoiceView(question: question, value: answer?.optionIndex, locked: locked, onSelect: _controller.select),
        ],
      ),
      FillBlankQuestion() => FillBlankView(
        question: question,
        number: position + 1,
        value: answer?.text ?? '',
        locked: locked,
        onChanged: _controller.select,
      ),
      UnscoredQuestion() => UnscoredView(question: question),
    };

    return Semantics(
      container: true,
      child: DecoratedBox(
        decoration: palette.box(shadow: true),
        child: Padding(
          padding: EdgeInsets.all(EqSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Semantics(header: true, child: Text('Question ${position + 1} of $total', style: EqTextStyles.labelLg(dark: palette.dark))),
              SizedBox(height: EqSpacing.md),
              content,
            ],
          ),
        ),
      ),
    );
  }
}
