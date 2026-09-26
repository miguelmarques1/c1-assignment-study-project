import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../../core/format/relative_time.dart';
import '../../../design/widgets/eq_card.dart';
import '../../../design/widgets/eq_chip.dart';
import '../lesson_format.dart';
import '../models/lesson_models.dart';
import 'lesson_status_badge.dart';
import 'palette.dart';

/// One history row: when, how long, who, the domain, the caller's status —
/// then the active stage, the fix or reason, or the headline once ready.
class LessonRow extends StatelessWidget {
  const LessonRow({super.key, required this.lesson, required this.onOpen});

  final LessonSummary lesson;
  final VoidCallback onOpen;

  (String, Color)? _line(LessonPalette palette) {
    switch (lesson.status) {
      case LessonHistoryStatus.ready:
        final headline = lesson.headline;
        return headline == null ? null : (headline, palette.onSurface);
      case LessonHistoryStatus.processing:
        final stage = lesson.activeStage;
        return stage == null ? null : (stage.active, palette.onSurfaceVariant);
      case LessonHistoryStatus.blocked:
      case LessonHistoryStatus.failed:
      case LessonHistoryStatus.tooShort:
      case LessonHistoryStatus.recordingFailed:
        final reason = lesson.statusReason;
        return reason == null ? null : (reason, palette.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = LessonPalette.of(context);
    final line = _line(palette);

    return Semantics(
      button: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onOpen,
        child: EqCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                '${formatRelativeDate(lesson.startedAt)} · ${formatDuration(lesson.durationSeconds)}',
                style: palette.label.copyWith(color: palette.onSurfaceVariant),
              ),
              SizedBox(height: EqSpacing.sm),
              LessonStatusBadge(status: lesson.status, flags: lesson.flags),
              SizedBox(height: EqSpacing.sm),
              Text(lesson.scenarioTitle ?? 'Conversation lesson', style: palette.title),
              SizedBox(height: EqSpacing.xs),
              Row(
                children: [
                  Icon(Icons.group_outlined, size: 20, color: palette.onSurfaceVariant),
                  SizedBox(width: EqSpacing.xs),
                  Expanded(child: Text(formatParticipants(lesson.participants), style: palette.bodySm)),
                ],
              ),
              if (lesson.vocabularyDomain != null) ...[
                SizedBox(height: EqSpacing.sm),
                Align(alignment: Alignment.centerLeft, child: EqChip(label: lesson.vocabularyDomain!)),
              ],
              if (line != null) ...[
                SizedBox(height: EqSpacing.sm),
                Text(line.$1, style: palette.body.copyWith(color: line.$2)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
