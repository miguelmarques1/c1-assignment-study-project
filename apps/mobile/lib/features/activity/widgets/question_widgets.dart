import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../../design/widgets/eq_text_field.dart';
import '../activity_models.dart';
import 'palette.dart';

/// Four large option cards (a radio group): every option is a 48dp+ target.
class MultipleChoiceView extends StatelessWidget {
  const MultipleChoiceView({super.key, required this.question, required this.value, required this.locked, required this.onSelect});

  final MultipleChoiceQuestion question;
  final int? value;
  final bool locked;
  final ValueChanged<ObjectiveAnswer> onSelect;

  @override
  Widget build(BuildContext context) {
    final palette = EqPalette.of(context);
    return Semantics(
      container: true,
      label: question.prompt,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < question.options.length; i++) ...[
            if (i > 0) SizedBox(height: EqSpacing.gutterMobile),
            Semantics(
              inMutuallyExclusiveGroup: true,
              checked: value == i,
              enabled: !locked,
              button: true,
              label: question.options[i],
              excludeSemantics: true,
              onTap: locked ? null : () => onSelect(ObjectiveAnswer.choice(index: question.index, optionIndex: i)),
              child: InkWell(
                borderRadius: BorderRadius.circular(EqRadius.lg),
                onTap: locked ? null : () => onSelect(ObjectiveAnswer.choice(index: question.index, optionIndex: i)),
                child: Opacity(
                  opacity: locked ? 0.8 : 1,
                  child: Container(
                    constraints: const BoxConstraints(minHeight: 56),
                    padding: EdgeInsets.all(EqSpacing.md),
                    decoration: palette.box(color: value == i ? palette.primaryContainer : palette.surfaceLowest),
                    child: Row(
                      children: [
                        Container(
                          width: 20,
                          height: 20,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: value == i ? palette.primary : palette.surface,
                            border: Border.all(color: palette.outline, width: 2),
                          ),
                        ),
                        SizedBox(width: EqSpacing.md),
                        Expanded(
                          child: Text(
                            question.options[i],
                            style: EqTextStyles.bodyLg(dark: palette.dark).copyWith(
                              color: value == i ? palette.onPrimaryContainer : palette.onSurface,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// The sentence with an inline input where the blank is, sized to the expected answer.
class FillBlankView extends StatefulWidget {
  const FillBlankView({super.key, required this.question, required this.number, required this.value, required this.locked, required this.onChanged});

  final FillBlankQuestion question;
  final int number;
  final String value;
  final bool locked;
  final ValueChanged<ObjectiveAnswer> onChanged;

  @override
  State<FillBlankView> createState() => _FillBlankViewState();
}

class _FillBlankViewState extends State<FillBlankView> {
  late final TextEditingController _controller = TextEditingController(text: widget.value);

  @override
  void didUpdateWidget(FillBlankView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.value != _controller.text) _controller.text = widget.value;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final style = EqTextStyles.bodyLg(dark: dark);
    final question = widget.question;
    // About one body-text character per blank slot, capped so a long answer never overflows a phone.
    final width = (question.blankLength * 11.0 + 24).clamp(96.0, 240.0);

    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      runSpacing: EqSpacing.xs,
      spacing: EqSpacing.xs,
      children: [
        if (question.before.trim().isNotEmpty) Text(question.before.trim(), style: style),
        EqTextField(
          controller: _controller,
          compact: true,
          compactWidth: width,
          enabled: !widget.locked,
          maxLength: 100,
          semanticLabel: 'Answer for question ${widget.number}',
          onChanged: (text) => widget.onChanged(ObjectiveAnswer.text(index: question.index, text: text)),
        ),
        if (question.after.trim().isNotEmpty) Text(question.after.trim(), style: style),
      ],
    );
  }
}

class UnscoredView extends StatelessWidget {
  const UnscoredView({super.key, required this.question});

  final UnscoredQuestion question;

  @override
  Widget build(BuildContext context) {
    final palette = EqPalette.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (question.prompt != null) ...[
          Text(question.prompt!, style: EqTextStyles.bodyLg(dark: palette.dark)),
          SizedBox(height: EqSpacing.sm),
        ],
        DecoratedBox(
          decoration: palette.box(color: palette.warningBg, radius: EqRadius.md),
          child: Padding(
            padding: EdgeInsets.all(EqSpacing.md),
            child: Text(question.reason.message, style: EqTextStyles.bodyMd(dark: palette.dark).copyWith(color: palette.warningFg)),
          ),
        ),
      ],
    );
  }
}

/// One dot per question. Answered (or unscored) ones before the current can be
/// revisited read-only; later ones stay disabled (forward-only, A7).
class QuestionDots extends StatelessWidget {
  const QuestionDots({super.key, required this.questions, required this.answers, required this.current, required this.viewing, required this.onSelect});

  final List<ObjectiveQuestion> questions;
  final List<ObjectiveAnswer> answers;
  final int current;
  final int? viewing;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    final palette = EqPalette.of(context);
    final answered = answers.map((answer) => answer.index).toSet();

    return Wrap(
      spacing: EqSpacing.sm,
      runSpacing: EqSpacing.sm,
      children: [
        for (var position = 0; position < questions.length; position++)
          Builder(
            builder: (context) {
              final question = questions[position];
              final done = position < current && (answered.contains(question.index) || !question.isScored);
              final active = (viewing ?? current) == position;
              final state = !question.isScored
                  ? 'not scored'
                  : done
                  ? 'answered'
                  : position == current
                  ? 'current'
                  : 'not answered yet';
              final enabled = position <= current;
              return Semantics(
                button: true,
                enabled: enabled,
                selected: active,
                label: 'Question ${position + 1}, $state',
                excludeSemantics: true,
                onTap: enabled ? () => onSelect(position) : null,
                child: InkWell(
                  customBorder: const CircleBorder(),
                  onTap: enabled ? () => onSelect(position) : null,
                  child: Opacity(
                    opacity: enabled ? 1 : 0.6,
                    child: Container(
                      width: 48,
                      height: 48,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: active ? palette.secondary : (done ? palette.primary : palette.surfaceLowest),
                        border: Border.all(color: palette.outline, width: 2),
                      ),
                      child: Text(
                        '${position + 1}',
                        style: EqTextStyles.labelMd(dark: palette.dark).copyWith(
                          color: active ? palette.onSecondary : (done ? palette.onPrimary : palette.onSurface),
                        ),
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
      ],
    );
  }
}
