import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../../design/widgets/eq_button.dart';
import '../lesson_format.dart';
import '../models/lesson_models.dart';
import '../models/pipeline_models.dart';
import '../models/recording_models.dart';
import 'palette.dart';

enum StepTone { done, active, waiting, attention, idle }

class StepperStep {
  const StepperStep({required this.title, required this.state, required this.tone, this.details = const []});

  final String title;

  /// Always a word, never only a colour: `Done`, `Running`, `Blocked`…
  final String state;
  final StepTone tone;
  final List<Widget> details;
}

/// A vertical stepper — the web's `Stepper`: the marker's colour is always
/// paired with the state's word.
class StageStepper extends StatelessWidget {
  const StageStepper({super.key, required this.label, required this.steps});

  final String label;
  final List<StepperStep> steps;

  @override
  Widget build(BuildContext context) {
    final palette = LessonPalette.of(context);
    Color marker(StepTone tone) => switch (tone) {
      StepTone.done => palette.tertiary,
      StepTone.active => palette.primary,
      StepTone.waiting => palette.surfaceContainerHighest,
      StepTone.attention => palette.error,
      StepTone.idle => palette.surfaceContainer,
    };
    Color text(StepTone tone) => switch (tone) {
      StepTone.done => palette.tertiary,
      StepTone.active => palette.primary,
      StepTone.attention => palette.error,
      StepTone.waiting || StepTone.idle => palette.onSurfaceVariant,
    };

    return Semantics(
      container: true,
      label: label,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final step in steps)
            Padding(
              key: ValueKey('step-${step.title}'),
              padding: EdgeInsets.only(bottom: EqSpacing.md),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: EdgeInsets.only(top: EqSpacing.xs),
                    child: ExcludeSemantics(
                      child: Container(
                        width: EqSpacing.md,
                        height: EqSpacing.md,
                        decoration: BoxDecoration(
                          color: marker(step.tone),
                          shape: BoxShape.circle,
                          border: Border.all(color: palette.outlineStrong, width: 2),
                        ),
                      ),
                    ),
                  ),
                  SizedBox(width: EqSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Wrap(
                          spacing: EqSpacing.sm,
                          crossAxisAlignment: WrapCrossAlignment.end,
                          children: [
                            Text(step.title, style: palette.title),
                            Text(step.state, style: palette.label.copyWith(color: text(step.tone))),
                          ],
                        ),
                        for (final detail in step.details)
                          Padding(padding: EdgeInsets.only(top: EqSpacing.xs), child: detail),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// The caller's own stepper: the scenario step, then every stage of the
/// shared order with its state, timing, progress, reason, settings link and
/// retry. A stage the branch never reached reads `Not started`.
class OwnStepper extends StatelessWidget {
  const OwnStepper({
    super.key,
    required this.detail,
    required this.pipeline,
    required this.recording,
    required this.onRetry,
    required this.onOpenSettings,
    required this.retrying,
    this.retryMessage,
  });

  final LessonDetail detail;
  final LessonPipelineView pipeline;
  final LessonRecordingView? recording;
  final void Function({required bool recordingStep}) onRetry;
  final VoidCallback onOpenSettings;
  final bool retrying;
  final String? retryMessage;

  @override
  Widget build(BuildContext context) {
    final palette = LessonPalette.of(context);
    Widget detailText(String text) => Text(text, style: palette.bodySm);

    final scenarioReady = detail.scenarioStatus == 'ready';
    final cardLine = switch (detail.myCardStatus) {
      'ready' => 'Your role card was ready.',
      'failed' => 'Your role card could not be generated.',
      _ => null,
    };
    final steps = <StepperStep>[
      StepperStep(
        title: 'Scenario',
        state: scenarioReady ? 'Ready' : (detail.scenarioStatus == 'failed' ? 'Failed' : 'No scenario'),
        tone: scenarioReady ? StepTone.done : StepTone.idle,
        details: [
          if (!scenarioReady) detailText('This lesson ran without a generated situation.'),
          if (cardLine != null) detailText(cardLine),
        ],
      ),
    ];

    for (final stage in PipelineStage.order) {
      final view = pipeline.stage(stage);
      if (view == null) {
        steps.add(StepperStep(title: stage.title, state: 'Not started', tone: StepTone.idle));
        continue;
      }
      final progress = view.progressTotal == null ? null : '${view.progressDone} of ${view.progressTotal} excerpts';
      final captured = stage.wire == 'recording' &&
              recording?.myRecordingStatus == 'partial' &&
              recording?.myCapturedSeconds != null
          ? 'Captured ${formatDuration(recording!.myCapturedSeconds)} of audio'
          : null;
      final started = view.startedAt;
      final finished = view.finishedAt;

      switch (view.status) {
        case PipelineStageStatus.completed:
          steps.add(
            StepperStep(
              title: stage.title,
              state: 'Done',
              tone: StepTone.done,
              details: [
                if (started != null && finished != null) detailText('Took ${formatElapsed(finished.difference(started))}'),
                if (progress != null) detailText(progress),
                if (captured != null) detailText(captured),
              ],
            ),
          );
        case PipelineStageStatus.running:
          steps.add(
            StepperStep(
              title: stage.active,
              state: 'Running',
              tone: StepTone.active,
              details: [
                if (started != null) detailText('${formatElapsed(pipeline.serverTime.difference(started))} so far'),
                if (progress != null) detailText(progress),
              ],
            ),
          );
        case PipelineStageStatus.retrying:
          steps.add(
            StepperStep(
              title: stage.active,
              state: 'Retrying',
              tone: StepTone.active,
              details: [
                if (view.nextAttemptAt != null) detailText('Next attempt at ${formatTimeOfDay(view.nextAttemptAt!)}'),
              ],
            ),
          );
        case PipelineStageStatus.queued:
        case PipelineStageStatus.unknown:
          steps.add(StepperStep(title: stage.title, state: 'Queued', tone: StepTone.waiting));
        case PipelineStageStatus.blockedMissingKey:
          steps.add(
            StepperStep(
              title: stage.title,
              state: 'Blocked',
              tone: StepTone.attention,
              details: [
                if (view.reason != null) Text(view.reason!, style: palette.body),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(onPressed: onOpenSettings, child: const Text('Open settings')),
                ),
              ],
            ),
          );
        case PipelineStageStatus.failed:
          final recordingRetry = stage.wire == 'recording' && (recording?.myBranchRetryable ?? false);
          steps.add(
            StepperStep(
              title: stage.title,
              state: 'Failed',
              tone: StepTone.attention,
              details: [
                if (view.reason != null) Text(view.reason!, style: palette.body),
                if (view.providerMessage != null) detailText('Details: ${view.providerMessage}'),
                if (captured != null) detailText(captured),
                if (view.lastAttemptAt != null) detailText('Last attempt ${formatTimeOfDay(view.lastAttemptAt!)}'),
                if (view.retryable || recordingRetry)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: EqButton(
                      label: 'Retry',
                      size: EqButtonSize.sm,
                      variant: EqButtonVariant.neutral,
                      loading: retrying,
                      loadingLabel: 'Retrying…',
                      onPressed: () => onRetry(recordingStep: recordingRetry),
                    ),
                  ),
                if ((view.retryable || recordingRetry) && retryMessage != null)
                  Text(retryMessage!, style: palette.bodySm.copyWith(color: palette.error)),
              ],
            ),
          );
      }
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!pipeline.hasBranch && detail.summary.statusReason != null) ...[
          Text(detail.summary.statusReason!, style: palette.body),
          SizedBox(height: EqSpacing.sm),
        ],
        StageStepper(label: 'Your processing', steps: steps),
      ],
    );
  }
}

/// Another participant's stepper — coarse by construction: no reason,
/// provider message, progress or retry exists for it (F19, A10).
class OtherStepper extends StatelessWidget {
  const OtherStepper({super.key, required this.other});

  final OtherParticipantProcessing other;

  @override
  Widget build(BuildContext context) {
    final palette = LessonPalette.of(context);
    StepTone tone(ParticipantStageState state) => switch (state) {
      ParticipantStageState.completed => StepTone.done,
      ParticipantStageState.pending => StepTone.waiting,
      ParticipantStageState.notStarted || ParticipantStageState.unavailable => StepTone.idle,
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(other.displayName, style: palette.titleLg),
        SizedBox(height: EqSpacing.sm),
        StageStepper(
          label: "${other.displayName}'s processing",
          steps: [
            for (final stage in other.stages)
              StepperStep(
                title: stage.stage.title,
                state: stage.state.label,
                tone: tone(stage.state),
                details: [
                  if (stage.state == ParticipantStageState.completed && stage.startedAt != null && stage.finishedAt != null)
                    Text('Took ${formatElapsed(stage.finishedAt!.difference(stage.startedAt!))}', style: palette.bodySm),
                ],
              ),
          ],
        ),
      ],
    );
  }
}
