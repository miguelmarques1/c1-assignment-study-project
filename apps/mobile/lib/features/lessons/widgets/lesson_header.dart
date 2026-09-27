import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../../core/format/relative_time.dart';
import '../../../design/widgets/eq_chip.dart';
import '../lesson_format.dart';
import '../models/lesson_models.dart';
import 'lesson_status_badge.dart';
import 'palette.dart';

/// The detail's header, at the top of every tab: when, how long, who, the
/// domain, the caller's own status and the lesson's storage.
class LessonHeader extends StatelessWidget {
  const LessonHeader({super.key, required this.lesson});

  final LessonSummary lesson;

  @override
  Widget build(BuildContext context) {
    final palette = LessonPalette.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        LessonStatusBadge(status: lesson.status, flags: lesson.flags),
        SizedBox(height: EqSpacing.sm),
        Text(
          '${formatAbsoluteDate(lesson.startedAt)} (${formatRelativeTime(lesson.startedAt)})',
          style: palette.body.copyWith(color: palette.onSurfaceVariant),
        ),
        SizedBox(height: EqSpacing.xs),
        Text(
          '${formatDuration(lesson.durationSeconds)} · ${formatParticipants(lesson.participants)}',
          style: palette.body.copyWith(color: palette.onSurfaceVariant),
        ),
        SizedBox(height: EqSpacing.xs),
        Wrap(
          spacing: EqSpacing.sm,
          runSpacing: EqSpacing.xs,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            if (lesson.vocabularyDomain != null) EqChip(label: lesson.vocabularyDomain!),
            Text('Recordings: ${formatBytes(lesson.storageBytes)}', style: palette.bodySm),
          ],
        ),
      ],
    );
  }
}

/// A titled block of a tab, spaced like the web's sections.
class LessonSection extends StatelessWidget {
  const LessonSection({super.key, required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final palette = LessonPalette.of(context);
    return Padding(
      padding: EdgeInsets.only(top: EqSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(header: true, child: Text(title, style: palette.headline)),
          SizedBox(height: EqSpacing.sm),
          ...children,
        ],
      ),
    );
  }
}
