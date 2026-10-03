import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../../design/widgets/eq_card.dart';
import '../../../design/widgets/eq_chip.dart';
import '../speaking_models.dart';

/// The passage or the prompt — the thing the user reads before recording.
/// Mirrors the web's `task-card.tsx`.
class TaskCard extends StatelessWidget {
  const TaskCard({super.key, required this.task});

  final SpeakingTaskView task;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final isReadAloud = task.shape == SpeakingShape.readAloud;

    return EqCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(isReadAloud ? (task.referenceText ?? '') : (task.prompt ?? ''), style: EqTextStyles.headlineSm(dark: dark)),
          if (!isReadAloud && task.hint != null) ...[
            SizedBox(height: EqSpacing.sm),
            Text(task.hint!, style: EqTextStyles.bodyMd(dark: dark).copyWith(color: dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant)),
          ],
          if (task.focusTags.isNotEmpty) ...[
            SizedBox(height: EqSpacing.md),
            Text(
              isReadAloud ? 'Sounds to watch:' : 'Try to work in:',
              style: EqTextStyles.labelMd(dark: dark).copyWith(color: dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant),
            ),
            SizedBox(height: EqSpacing.xs),
            Wrap(
              spacing: EqSpacing.xs,
              runSpacing: EqSpacing.xs,
              children: [for (final tag in task.focusTags) EqChip(label: tag.label, tone: EqChipTone.accent)],
            ),
          ],
          if (!isReadAloud) ...[
            SizedBox(height: EqSpacing.sm),
            Text(
              'Aim for 30–90 seconds.',
              style: EqTextStyles.labelMd(dark: dark).copyWith(color: dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant),
            ),
          ],
        ],
      ),
    );
  }
}
