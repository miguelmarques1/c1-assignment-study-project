import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../../design/widgets/eq_badge.dart';
import '../../../design/widgets/eq_chip.dart';
import '../models/lesson_models.dart';

/// The caller's own status as a badge and its flags as chips beside it — the
/// web's `LessonStatusBadge`, with the same labels and colour mapping.
class LessonStatusBadge extends StatelessWidget {
  const LessonStatusBadge({super.key, required this.status, required this.flags});

  final LessonHistoryStatus status;
  final List<LessonHistoryFlag> flags;

  static EqBadgeStatus badgeFor(LessonHistoryStatus status) => switch (status) {
    LessonHistoryStatus.processing => EqBadgeStatus.info,
    LessonHistoryStatus.ready => EqBadgeStatus.success,
    LessonHistoryStatus.blocked => EqBadgeStatus.warning,
    LessonHistoryStatus.failed || LessonHistoryStatus.recordingFailed => EqBadgeStatus.danger,
    LessonHistoryStatus.tooShort => EqBadgeStatus.neutral,
  };

  static EqChipTone toneFor(LessonHistoryFlag flag) => switch (flag) {
    LessonHistoryFlag.partial => EqChipTone.warning,
    LessonHistoryFlag.noScenario => EqChipTone.neutral,
    LessonHistoryFlag.endedUnexpectedly => EqChipTone.accent,
  };

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: EqSpacing.xs,
      runSpacing: EqSpacing.xs,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        EqBadge(status: badgeFor(status), label: status.label),
        for (final flag in flags) EqChip(label: flag.label, tone: toneFor(flag)),
      ],
    );
  }
}
