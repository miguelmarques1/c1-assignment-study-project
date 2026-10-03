import 'package:dio/dio.dart';
import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_modular/flutter_modular.dart';
import 'package:get/get.dart';

import '../../design/widgets/eq_button.dart';
import '../../design/widgets/eq_page_state.dart';
import '../activity/difficulty_rating.dart';
import 'microphone_rationale_sheet.dart';
import 'speaking_api.dart';
import 'speaking_controller.dart';
import 'speaking_models.dart';
import 'widgets/attempt_list.dart';
import 'widgets/attempt_result.dart';
import 'widgets/recording_waveform.dart';
import 'widgets/speaking_blocked.dart';
import 'widgets/task_card.dart';

/// The speaking/pronunciation runner: `ready` → `recording` → `review` →
/// `submitting` → `result`, plus the blocked and permission gates. No
/// mockup covers this screen (A24's precedent); composed from the
/// design-system primitives and the dashboard-card conventions directly.
/// Mirrors the web's `speaking-runner.tsx`.
class SpeakingPage extends StatefulWidget {
  const SpeakingPage({super.key, required this.activityId, this.api});

  final String activityId;
  final SpeakingApi? api;

  @override
  State<SpeakingPage> createState() => _SpeakingPageState();
}

class _SpeakingPageState extends State<SpeakingPage> {
  late final SpeakingController _controller = SpeakingController(widget.api ?? SpeakingApi(inject<Dio>()), widget.activityId);

  @override
  void initState() {
    super.initState();
    _controller.load();
  }

  @override
  void dispose() {
    _controller.onClose();
    super.dispose();
  }

  Future<void> _requestStart() async {
    final alreadyShown = await hasShownMicrophoneRationale();
    if (!alreadyShown) {
      if (!mounted) return;
      final continueRequested = await showMicrophoneRationaleSheet(context);
      await markMicrophoneRationaleShown();
      if (!continueRequested) return;
    }
    await _controller.startRecording();
  }

  void _seeFullPlan() => context.navigate('/app/plan');

  @override
  Widget build(BuildContext context) {
    final padding = EdgeInsets.all(EqSpacing.marginMobile);

    return Scaffold(
      appBar: AppBar(title: const Text('Speaking practice')),
      body: SafeArea(
        child: Obx(() {
          final activity = _controller.activity.value;
          final error = _controller.error.value;

          if (!_controller.loaded.value) {
            return ListView(
              padding: padding,
              children: [
                if (error != null) EqError(cause: error.message, onRetry: _controller.load) else const EqLoading(blockCount: 5, blockHeight: 64),
              ],
            );
          }

          return ListView(
            padding: padding,
            children: [
              Text(activity!.title, style: EqTextStyles.headlineSm(dark: Theme.of(context).brightness == Brightness.dark)),
              SizedBox(height: EqSpacing.md),
              if (activity.task != null) ...[TaskCard(task: activity.task!), SizedBox(height: EqSpacing.lg)],
              _body(activity),
              SizedBox(height: EqSpacing.lg),
              if (_resultAttempt(activity)?.result != null && activity.task != null) ...[
                AttemptResult(
                  result: _resultAttempt(activity)!.result!,
                  shape: activity.task!.shape,
                  onPlayRange: (startMs, durationMs) => _controller.playRange(_resultAttempt(activity)!.id, startMs, durationMs),
                ),
                SizedBox(height: EqSpacing.lg),
              ],
              AttemptList(
                attempts: activity.attempts,
                attemptsRemaining: activity.attemptsRemaining,
                playingAttemptId: _controller.playingAttemptId.value,
                onTogglePlay: _controller.togglePlayAttempt,
                onRescore: _controller.rescore,
                rescoringId: _controller.rescoringId.value,
              ),
              if (activity.block != SpeakingBlock.planArchived && activity.block != SpeakingBlock.activitySkipped) ...[
                SizedBox(height: EqSpacing.lg),
                DifficultyRatingWidget(
                  value: activity.rating == null ? null : DifficultyRatingValue(rating: activity.rating!.rating, notUseful: activity.rating!.notUseful),
                  onRate: (input) => _controller.rate(SpeakingRatingInput(rating: input.rating, notUseful: input.notUseful)),
                ),
              ],
              SizedBox(height: EqSpacing.lg),
              EqButton(label: 'Back to today', variant: EqButtonVariant.neutral, onPressed: _seeFullPlan),
            ],
          );
        }),
      ),
    );
  }

  SpeakingAttemptView? _resultAttempt(SpeakingActivityView activity) {
    final id = _controller.resultAttemptId.value;
    if (id == null) return null;
    for (final attempt in activity.attempts) {
      if (attempt.id == id) return attempt;
    }
    return null;
  }

  Widget _body(SpeakingActivityView activity) {
    final serverBlock = activity.block;
    final readOnly = serverBlock == SpeakingBlock.planArchived || serverBlock == SpeakingBlock.activitySkipped;

    if (readOnly) {
      return SpeakingBlocked(gate: serverBlock == SpeakingBlock.planArchived ? SpeakingGate.planArchived : SpeakingGate.activitySkipped);
    }

    if (_controller.recorderStatus.value == RecorderStatus.error) {
      return SpeakingBlocked(
        gate: SpeakingGate.micDenied,
        onRetry: _controller.recorderErrorReason.value == RecorderErrorReason.denied ? _requestStart : null,
      );
    }

    if (serverBlock == SpeakingBlock.azureKeyMissing && !_controller.hasUnsentRecording) {
      return const SpeakingBlocked(gate: SpeakingGate.azureKeyMissing);
    }

    if (_controller.recorderStatus.value == RecorderStatus.stopped || _controller.uploadFailure.value != null) {
      return _reviewPanel();
    }

    return _recorderPanel(activity);
  }

  Widget _recorderPanel(SpeakingActivityView activity) {
    final recording = _controller.recorderStatus.value == RecorderStatus.recording;
    final canRecord = activity.attemptsRemaining > 0;
    final attemptsUsed = activity.attemptsUsed;
    final attemptsRemaining = activity.attemptsRemaining;
    final maxAttempts = activity.limits.maxAttempts;
    final counterText = attemptsRemaining <= 0
        ? 'All $maxAttempts attempts used. Your best score counts.'
        : 'Attempt ${attemptsUsed + 1} of $maxAttempts';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (canRecord) ...[
          RecordingWaveform(level: recording ? _controller.level.value : null),
          SizedBox(height: EqSpacing.sm),
          Center(child: Text(_clock(_controller.elapsedMs.value))),
          SizedBox(height: EqSpacing.md),
          EqButton(
            label: recording ? 'Stop' : 'Record',
            variant: recording ? EqButtonVariant.destructive : EqButtonVariant.primary,
            size: EqButtonSize.lg,
            onPressed: recording ? _controller.stopRecording : _requestStart,
          ),
          SizedBox(height: EqSpacing.sm),
        ],
        Center(child: Text(counterText)),
      ],
    );
  }

  Widget _reviewPanel() {
    final uploadFailure = _controller.uploadFailure.value;

    if (uploadFailure == UploadFailureKind.credential) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Add your Azure Speech key to use speaking activities.'),
          SizedBox(height: EqSpacing.sm),
          EqButton(label: 'Open settings', onPressed: () => context.navigate('/app/settings')),
          SizedBox(height: EqSpacing.sm),
          Row(
            children: [
              Expanded(child: EqButton(label: 'Discard', variant: EqButtonVariant.neutral, onPressed: _controller.discard)),
              SizedBox(width: EqSpacing.sm),
              Expanded(
                child: EqButton(
                  label: 'Retry',
                  loading: _controller.submitting.value,
                  loadingLabel: 'Retrying…',
                  onPressed: _controller.submit,
                ),
              ),
            ],
          ),
        ],
      );
    }

    if (uploadFailure == UploadFailureKind.network) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Your recording could not be uploaded. Retry?'),
          SizedBox(height: EqSpacing.sm),
          Row(
            children: [
              Expanded(child: EqButton(label: 'Discard', variant: EqButtonVariant.neutral, onPressed: _controller.discard)),
              SizedBox(width: EqSpacing.sm),
              Expanded(
                child: EqButton(
                  label: 'Retry',
                  loading: _controller.submitting.value,
                  loadingLabel: 'Retrying…',
                  onPressed: _controller.submit,
                ),
              ),
            ],
          ),
        ],
      );
    }

    final playingLocal = _controller.playingLocal.value;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        EqButton(
          label: playingLocal ? 'Pause' : 'Play recording',
          variant: EqButtonVariant.neutral,
          onPressed: playingLocal ? _controller.stopPlayback : _controller.playPendingRecording,
        ),
        SizedBox(height: EqSpacing.sm),
        Row(
          children: [
            Expanded(child: EqButton(label: 'Discard', variant: EqButtonVariant.neutral, onPressed: _controller.discard)),
            SizedBox(width: EqSpacing.sm),
            Expanded(
              child: EqButton(
                label: 'Submit',
                loading: _controller.submitting.value,
                loadingLabel: 'Scoring your pronunciation…',
                onPressed: _controller.submit,
              ),
            ),
          ],
        ),
      ],
    );
  }

  String _clock(int ms) {
    final totalSeconds = (ms / 1000).floor();
    final minutes = totalSeconds ~/ 60;
    final seconds = totalSeconds % 60;
    return '$minutes:${seconds.toString().padLeft(2, '0')}';
  }
}
