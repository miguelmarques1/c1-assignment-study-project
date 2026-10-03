import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../../design/widgets/eq_card.dart';
import '../../../design/widgets/eq_chip.dart';
import '../writing_models.dart';

/// `EqCard` with the heading, statement, tag chips and the `Show task` /
/// `Hide task` toggle (A28): expanded when the draft is empty, collapsed
/// when resuming a draft that already has text.
class WritingTaskCard extends StatefulWidget {
  const WritingTaskCard({super.key, required this.task, required this.defaultExpanded});

  final WritingTaskView task;
  final bool defaultExpanded;

  @override
  State<WritingTaskCard> createState() => _WritingTaskCardState();
}

class _WritingTaskCardState extends State<WritingTaskCard> {
  late bool _expanded = widget.defaultExpanded;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final onSurface = dark ? EqDarkColors.onSurface : EqLightColors.onSurface;
    final primary = dark ? EqDarkColors.primary : EqLightColors.primary;

    return EqCard(
      header: Row(
        children: [
          Expanded(child: Text(widget.task.heading, style: EqTextStyles.titleMd(dark: dark).copyWith(color: onSurface))),
          SizedBox(width: EqSpacing.sm),
          Semantics(
            button: true,
            toggled: _expanded,
            child: InkWell(
              onTap: () => setState(() => _expanded = !_expanded),
              child: Text(
                _expanded ? 'Hide task' : 'Show task',
                style: EqTextStyles.labelMd(dark: dark).copyWith(color: primary),
              ),
            ),
          ),
        ],
      ),
      child: _expanded
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(widget.task.statement, style: EqTextStyles.bodyMd(dark: dark).copyWith(color: onSurface)),
                if (widget.task.targetTags.isNotEmpty) ...[
                  SizedBox(height: EqSpacing.sm),
                  Wrap(
                    spacing: EqSpacing.sm,
                    runSpacing: EqSpacing.sm,
                    children: [for (final tag in widget.task.targetTags) EqChip(label: tag.label, tone: EqChipTone.accent)],
                  ),
                ],
              ],
            )
          : const SizedBox.shrink(),
    );
  }
}
