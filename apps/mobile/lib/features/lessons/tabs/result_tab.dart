import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../design/widgets/eq_badge.dart';
import '../../../design/widgets/eq_button.dart';
import '../../../design/widgets/eq_card.dart';
import '../../../design/widgets/eq_chip.dart';
import '../../../design/widgets/eq_meter.dart';
import '../../../design/widgets/eq_page_state.dart';
import '../lesson_detail_controller.dart';
import '../lessons_page.dart';
import '../models/analysis_models.dart';
import '../models/lesson_models.dart';
import '../models/pipeline_models.dart';
import '../models/pronunciation_models.dart';
import '../models/scenario_models.dart';
import '../widgets/error_card.dart';
import '../widgets/lesson_header.dart';
import '../widgets/palette.dart';
import 'tab_body.dart';

/// What the sixth meter and the pronunciation section say without a score — the web's copy.
const pronunciationAbsent = {
  'pending': 'Pronunciation is still being assessed.',
  'no_sample': 'Not enough clear speech was captured to score pronunciation in this lesson.',
  'failed': 'Pronunciation could not be assessed for this lesson.',
  'unavailable': 'There is no pronunciation result for you in this lesson.',
};

const noScenarioSentence = 'No scenario was in play for this lesson.';

/// The Result tab — the same content and order as the web's Result area.
/// Pronunciation renders whether or not the analysis is ready: a missing
/// Gemini key blocks only the analysis (F11).
class ResultTab extends StatelessWidget {
  const ResultTab({
    super.key,
    required this.controller,
    required this.onSeeInTranscript,
    required this.onOpenStatus,
    required this.onNavigate,
  });

  final LessonDetailController controller;
  final void Function(String utteranceId) onSeeInTranscript;
  final VoidCallback onOpenStatus;
  final void Function(String path) onNavigate;

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final lesson = controller.detail.data.value!.summary;
      final analysisError = controller.analysis.error.value;
      final analysisView = controller.analysis.data.value;
      final pronunciationError = controller.pronunciation.error.value;
      final pronunciation = controller.pronunciation.data.value;
      final ready = analysisView?.status == 'ready' ? analysisView?.analysis : null;

      return LessonTabBody(
        lesson: lesson,
        onRefresh: controller.loadAll,
        children: [
          if (analysisError != null)
            EqError(cause: lessonLoadFailure(analysisError, 'your result'), onRetry: controller.loadAnalysis)
          else if (analysisView == null)
            const EqLoading()
          else if (ready != null)
            ..._analysis(context, ready, pronunciation)
          else
            _StatusPanel(
              lesson: lesson,
              analysisStatus: analysisView.status,
              pipeline: controller.pipeline.data.value,
              retrying: controller.retrying.value,
              onRetry: () => controller.retry(),
              onOpenStatus: onOpenStatus,
              onOpenSettings: () => onNavigate('/app/settings'),
            ),
          LessonSection(
            title: 'Pronunciation',
            children: [
              if (pronunciationError != null)
                EqError(cause: lessonLoadFailure(pronunciationError, 'your pronunciation result'), onRetry: controller.loadPronunciation)
              else if (pronunciation == null)
                const EqLoading()
              else
                _PronunciationSection(view: pronunciation, onSeeInTranscript: onSeeInTranscript),
            ],
          ),
        ],
      );
    });
  }

  List<Widget> _analysis(BuildContext context, LessonAnalysisResult analysis, LessonPronunciationView? pronunciation) {
    final palette = LessonPalette.of(context);
    final overall = pronunciation?.status == 'assessed' ? pronunciation?.result?.overall : null;
    final labelOf = {for (final error in analysis.errors) error.tag: error.tagLabel};
    const groups = [('major', 'Major'), ('moderate', 'Moderate'), ('minor', 'Minor')];

    return [
      LessonSection(
        title: 'Your scores',
        children: [
          for (final competency in analysis.competencies) ...[
            EqMeter(
              label: competency.label,
              value: competency.score,
              delta: competency.delta,
              noPreviousResult: competency.delta == null,
            ),
            SizedBox(height: EqSpacing.xs),
            Text(competency.justification, style: palette.bodySm),
            SizedBox(height: EqSpacing.md),
          ],
          if (overall != null)
            EqMeter(label: 'Pronunciation', value: overall.score, delta: overall.delta, noPreviousResult: overall.delta == null)
          else ...[
            Text('Pronunciation', style: palette.label.copyWith(color: palette.onSurfaceVariant)),
            Text(
              pronunciationAbsent[pronunciation?.status] ?? 'Your pronunciation result could not be loaded.',
              style: palette.bodySm,
            ),
          ],
        ],
      ),
      if (analysis.notes.isNotEmpty)
        Padding(
          padding: EdgeInsets.only(top: EqSpacing.md),
          child: EqCard(
            tone: EqCardTone.info,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [for (final note in analysis.notes) Text(note, style: palette.bodySm)],
            ),
          ),
        ),
      if (analysis.strengths.isNotEmpty)
        LessonSection(title: 'Strengths', children: [for (final strength in analysis.strengths) Text('• $strength', style: palette.body)]),
      LessonSection(
        title: 'Errors to work on',
        children: [
          if (analysis.errors.isEmpty) Text('No errors were found in this lesson.', style: palette.bodySm),
          for (final (severity, title) in groups)
            if (analysis.errors.any((error) => error.severity == severity)) ...[
              Text('$title (${analysis.errors.where((error) => error.severity == severity).length})', style: palette.title),
              SizedBox(height: EqSpacing.sm),
              for (final error in analysis.errors.where((error) => error.severity == severity))
                Padding(
                  padding: EdgeInsets.only(bottom: EqSpacing.gutterMobile),
                  child: ErrorCard(
                    error: error,
                    onSeeInTranscript: error.utteranceId == null ? null : () => onSeeInTranscript(error.utteranceId!),
                  ),
                ),
            ],
        ],
      ),
      if (analysis.scenarioFit != null)
        LessonSection(title: 'Scenario fit', children: [_ScenarioFit(fit: analysis.scenarioFit!)])
      else if (analysis.scenarioContext == 'none')
        LessonSection(title: 'Scenario fit', children: [Text(noScenarioSentence, style: palette.bodySm)]),
      if (analysis.recurringTags.isNotEmpty)
        LessonSection(
          title: 'Recurring',
          children: [
            Wrap(
              spacing: EqSpacing.sm,
              runSpacing: EqSpacing.sm,
              children: [
                for (final tag in analysis.recurringTags) EqChip(label: labelOf[tag] ?? tag, tone: EqChipTone.warning),
              ],
            ),
          ],
        ),
      if (analysis.topicsToPractice.isNotEmpty)
        LessonSection(
          title: 'Topics to practice',
          children: [for (final topic in analysis.topicsToPractice) Text('• $topic', style: palette.body)],
        ),
    ];
  }
}

class _ScenarioFit extends StatelessWidget {
  const _ScenarioFit({required this.fit});

  final ScenarioFitView fit;

  @override
  Widget build(BuildContext context) {
    final palette = LessonPalette.of(context);
    Widget group(String title, List<String> expressions, EqChipTone tone) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(title, style: palette.title),
        SizedBox(height: EqSpacing.xs),
        if (expressions.isEmpty)
          Text('None', style: palette.bodySm)
        else
          Wrap(
            spacing: EqSpacing.sm,
            runSpacing: EqSpacing.sm,
            children: [for (final expression in expressions) EqChip(label: expression, tone: tone)],
          ),
      ],
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('You played ${fit.roleLabel}.', style: palette.body),
        SizedBox(height: EqSpacing.xs),
        Wrap(
          spacing: EqSpacing.sm,
          runSpacing: EqSpacing.xs,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text('Expected: ${registerLabels[fit.registerExpected] ?? fit.registerExpected}', style: palette.body),
            EqBadge(
              status: fit.registerMatched ? EqBadgeStatus.success : EqBadgeStatus.warning,
              label: fit.registerMatched ? 'Register matched' : 'Register missed',
            ),
          ],
        ),
        SizedBox(height: EqSpacing.xs),
        Text(fit.registerComment, style: palette.bodySm),
        SizedBox(height: EqSpacing.md),
        group('Used', fit.expressionsUsed, EqChipTone.success),
        SizedBox(height: EqSpacing.md),
        group('Not used', fit.expressionsNotUsed, EqChipTone.neutral),
      ],
    );
  }
}

/// While the analysis is not ready: what runs now, the fix for a blocked
/// stage, the reason and a retry for a failed one, or why there is no result.
class _StatusPanel extends StatelessWidget {
  const _StatusPanel({
    required this.lesson,
    required this.analysisStatus,
    required this.pipeline,
    required this.retrying,
    required this.onRetry,
    required this.onOpenStatus,
    required this.onOpenSettings,
  });

  final LessonSummary lesson;
  final String analysisStatus;
  final LessonPipelineView? pipeline;
  final bool retrying;
  final VoidCallback onRetry;
  final VoidCallback onOpenStatus;
  final VoidCallback onOpenSettings;

  @override
  Widget build(BuildContext context) {
    final palette = LessonPalette.of(context);
    final retryable = pipeline?.stages.any((stage) => stage.status == PipelineStageStatus.failed && stage.retryable) ?? false;
    final statusLink = Align(
      alignment: Alignment.centerLeft,
      child: TextButton(onPressed: onOpenStatus, child: const Text('See processing status')),
    );
    final reason = lesson.statusReason;

    final (String title, List<Widget> body, EqCardTone tone) = switch (lesson.status) {
      LessonHistoryStatus.blocked => (
        'Your result is waiting',
        [
          if (reason != null) Text(reason, style: palette.body),
          Align(alignment: Alignment.centerLeft, child: TextButton(onPressed: onOpenSettings, child: const Text('Open settings'))),
        ],
        EqCardTone.neutral,
      ),
      _ when lesson.status == LessonHistoryStatus.failed || analysisStatus == 'failed' => (
        'Your result could not be prepared',
        [
          if (reason != null) Text(reason, style: palette.body),
          if (retryable)
            Align(
              alignment: Alignment.centerLeft,
              child: EqButton(
                label: 'Retry',
                size: EqButtonSize.sm,
                variant: EqButtonVariant.neutral,
                loading: retrying,
                loadingLabel: 'Retrying…',
                onPressed: onRetry,
              ),
            )
          else
            statusLink,
        ],
        EqCardTone.neutral,
      ),
      LessonHistoryStatus.processing when analysisStatus == 'pending' => (
        'Your result is being prepared',
        [
          if (lesson.activeStage != null) Text('Now: ${lesson.activeStage!.active}', style: palette.body),
          statusLink,
        ],
        EqCardTone.info,
      ),
      _ => (
        'There is no result for you in this lesson',
        [if (reason != null) Text(reason, style: palette.body)],
        EqCardTone.neutral,
      ),
    };

    return Semantics(
      container: true,
      label: 'Result status',
      child: EqCard(
        tone: tone,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [Text(title, style: palette.title), SizedBox(height: EqSpacing.xs), ...body],
        ),
      ),
    );
  }
}

class _PronunciationSection extends StatelessWidget {
  const _PronunciationSection({required this.view, required this.onSeeInTranscript});

  final LessonPronunciationView view;
  final void Function(String utteranceId) onSeeInTranscript;

  @override
  Widget build(BuildContext context) {
    final palette = LessonPalette.of(context);
    final result = view.status == 'assessed' ? view.result : null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (result == null)
          Text(pronunciationAbsent[view.status] ?? pronunciationAbsent['unavailable']!, style: palette.body)
        else ...[
          EqMeter(label: 'Pronunciation', value: result.overall.score, delta: result.overall.delta, noPreviousResult: result.overall.delta == null),
          for (final (label, value) in [
            ('Accuracy', result.scores.accuracy),
            ('Fluency', result.scores.fluency),
            ('Prosody', result.scores.prosody),
            ('Completeness', result.scores.completeness),
          ]) ...[
            SizedBox(height: EqSpacing.md),
            if (value == null)
              Row(
                children: [
                  Expanded(child: Text(label, style: palette.label.copyWith(color: palette.onSurfaceVariant))),
                  Text('Not measured', style: palette.label.copyWith(color: palette.onSurfaceVariant)),
                ],
              )
            else
              EqMeter(label: label, value: value.round()),
          ],
          for (final note in result.notes) ...[
            SizedBox(height: EqSpacing.sm),
            Text(note, style: palette.bodySm),
          ],
          if (result.worstPhonemes.isNotEmpty) ...[
            SizedBox(height: EqSpacing.md),
            Text('Sounds to work on', style: palette.title),
            for (final phoneme in result.worstPhonemes)
              Text('${phoneme.phoneme} — ${phoneme.meanAccuracy.round()}, as in “${phoneme.exampleWord}”', style: palette.body),
          ],
          if (result.worstWords.isNotEmpty) ...[
            SizedBox(height: EqSpacing.md),
            Text('Words to work on', style: palette.title),
            Wrap(
              spacing: EqSpacing.xs,
              children: [
                for (final word in result.worstWords)
                  TextButton(
                    onPressed: () => onSeeInTranscript(word.exampleUtteranceId),
                    child: Text('${word.word} ${word.meanAccuracy.round()}'),
                  ),
              ],
            ),
          ],
        ],
        if (view.excerpts.isNotEmpty) ...[
          SizedBox(height: EqSpacing.md),
          Text('Assessed excerpts', style: palette.title),
          SizedBox(height: EqSpacing.xs),
          for (final excerpt in view.excerpts)
            Semantics(
              button: true,
              child: GestureDetector(
                key: ValueKey('assessed-excerpt-${excerpt.utteranceId}'),
                behavior: HitTestBehavior.opaque,
                onTap: () => onSeeInTranscript(excerpt.utteranceId),
                child: Padding(
                  padding: EdgeInsets.symmetric(vertical: EqSpacing.xs),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      EqBadge(
                        status: excerpt.pronunciation.status == 'assessed' ? EqBadgeStatus.info : EqBadgeStatus.neutral,
                        label: excerpt.pronunciation.badgeText,
                      ),
                      SizedBox(width: EqSpacing.sm),
                      Expanded(child: Text('“${excerpt.referenceText}”', style: palette.body)),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ],
    );
  }
}
