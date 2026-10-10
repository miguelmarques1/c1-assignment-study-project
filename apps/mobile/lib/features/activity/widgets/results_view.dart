import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../../design/widgets/eq_button.dart';
import '../../plan/plan_models.dart';
import '../activity_models.dart';
import 'palette.dart';
import 'passage_pane.dart';

/// One question's feedback: correct or incorrect (always with a text label,
/// never colour alone), the learner's answer, the correct answer where they
/// differ, and the stored explanation. Incorrect questions open expanded.
class ResultQuestionTile extends StatefulWidget {
  const ResultQuestionTile({super.key, required this.question, required this.number});

  final ResultQuestion question;
  final int number;

  @override
  State<ResultQuestionTile> createState() => _ResultQuestionTileState();
}

class _ResultQuestionTileState extends State<ResultQuestionTile> {
  late var _expanded = widget.question.outcome != ResultOutcome.correct;

  @override
  Widget build(BuildContext context) {
    final palette = EqPalette.of(context);
    final question = widget.question;
    final style = EqTextStyles.bodyMd(dark: palette.dark);
    final others = question.acceptedAnswers.where((answer) => answer != question.correctAnswer).toList();
    final icon = switch (question.outcome) {
      ResultOutcome.correct => Icons.check_circle_outline,
      ResultOutcome.incorrect => Icons.highlight_off,
      ResultOutcome.unscored => Icons.remove_circle_outline,
    };

    return DecoratedBox(
      decoration: palette.box(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            button: true,
            expanded: _expanded,
            label: 'Question ${widget.number}: ${question.outcome.label}',
            excludeSemantics: true,
            onTap: () => setState(() => _expanded = !_expanded),
            child: InkWell(
              borderRadius: BorderRadius.circular(EqRadius.lg),
              onTap: () => setState(() => _expanded = !_expanded),
              child: Padding(
                padding: EdgeInsets.all(EqSpacing.md),
                child: Row(
                  children: [
                    Icon(icon, size: 24, color: palette.onSurface),
                    SizedBox(width: EqSpacing.sm),
                    Expanded(
                      child: Text(
                        'Question ${widget.number}: ${question.outcome.label}',
                        style: EqTextStyles.labelLg(dark: palette.dark),
                      ),
                    ),
                    Icon(_expanded ? Icons.expand_less : Icons.expand_more, size: 24, color: palette.onSurface),
                  ],
                ),
              ),
            ),
          ),
          if (_expanded)
            Padding(
              padding: EdgeInsets.fromLTRB(EqSpacing.md, 0, EqSpacing.md, EqSpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (question.prompt != null) Text(question.prompt!, style: style),
                  SizedBox(height: EqSpacing.sm),
                  if (question.outcome == ResultOutcome.unscored)
                    Text(question.unscoredReason?.message ?? '', style: style.copyWith(color: palette.onSurfaceVariant))
                  else ...[
                    Text('Your answer: ${question.response ?? '—'}', style: style),
                    if (question.response != question.correctAnswer && question.correctAnswer != null) ...[
                      SizedBox(height: EqSpacing.xs),
                      Text('Correct answer: ${question.correctAnswer}', style: style),
                    ],
                    if (others.isNotEmpty) ...[
                      SizedBox(height: EqSpacing.xs),
                      Text('Also accepted: ${others.join(', ')}', style: style.copyWith(color: palette.onSurfaceVariant)),
                    ],
                    if (question.explanation != null) ...[
                      SizedBox(height: EqSpacing.sm),
                      Text(question.explanation!, style: style.copyWith(color: palette.onSurfaceVariant)),
                    ],
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }
}

const planReplacedNote = 'This activity is no longer in your current plan. Your answers still count toward your profile.';

/// The score, every question's feedback, the transcript for listening and the way on.
/// The rating prompt is passed in, so this stays free of the network.
class ResultsView extends StatelessWidget {
  const ResultsView({super.key, required this.view, required this.rating, required this.nextLabel, required this.onNext});

  final ActivityView view;
  final Widget? rating;
  final String nextLabel;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    final palette = EqPalette.of(context);
    final result = view.objective!.result!;
    final item = view.objective!.item;
    final transcript = item.passage != null && item.passage!.isTranscript ? item.passage : null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DecoratedBox(
          decoration: palette.box(color: palette.primaryContainer, shadow: true),
          child: Padding(
            padding: EdgeInsets.all(EqSpacing.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  '${result.scoreCorrect} of ${result.scoreTotal} correct',
                  style: EqTextStyles.headlineMd(dark: palette.dark).copyWith(color: palette.onPrimaryContainer),
                ),
                if (result.unscoredCount > 0)
                  Text(
                    result.unscoredCount == 1 ? "1 question wasn't scored." : "${result.unscoredCount} questions weren't scored.",
                    style: EqTextStyles.bodyMd(dark: palette.dark).copyWith(color: palette.onPrimaryContainer),
                  ),
              ],
            ),
          ),
        ),
        if (view.activity.readOnly && view.activity.state != PlanActivityState.completed) ...[
          SizedBox(height: EqSpacing.md),
          DecoratedBox(
            decoration: palette.box(color: palette.infoBg, radius: EqRadius.md),
            child: Padding(
              padding: EdgeInsets.all(EqSpacing.md),
              child: Text(planReplacedNote, style: EqTextStyles.bodyMd(dark: palette.dark).copyWith(color: palette.infoFg)),
            ),
          ),
        ],
        SizedBox(height: EqSpacing.md),
        for (var i = 0; i < result.questions.length; i++) ...[
          if (i > 0) SizedBox(height: EqSpacing.gutterMobile),
          ResultQuestionTile(question: result.questions[i], number: i + 1),
        ],
        if (transcript != null) ...[
          SizedBox(height: EqSpacing.md),
          PassagePane(passage: transcript, source: item.source),
        ],
        if (rating != null) ...[SizedBox(height: EqSpacing.md), rating!],
        SizedBox(height: EqSpacing.md),
        EqButton(label: nextLabel, size: EqButtonSize.lg, onPressed: onNext),
      ],
    );
  }
}
