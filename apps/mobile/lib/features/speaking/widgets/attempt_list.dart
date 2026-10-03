import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../../design/widgets/eq_button.dart';
import '../speaking_models.dart';

/// Every attempt so far, oldest first: its score or failure, a play of the
/// whole recording, and re-score when it qualifies. Mirrors the web's
/// `attempt-list.tsx`.
class AttemptList extends StatelessWidget {
  const AttemptList({
    super.key,
    required this.attempts,
    required this.attemptsRemaining,
    required this.playingAttemptId,
    required this.onTogglePlay,
    required this.onRescore,
    required this.rescoringId,
  });

  final List<SpeakingAttemptView> attempts;
  final int attemptsRemaining;
  final String? playingAttemptId;
  final void Function(String attemptId) onTogglePlay;
  final void Function(String attemptId) onRescore;
  final String? rescoringId;

  String _text(SpeakingAttemptView attempt, String ordinalLabel) {
    final result = attempt.result;
    if (attempt.state == SpeakingAttemptState.scored && result != null) {
      final score = result.scores.pronunciation.round();
      return attempt.isBest ? '$ordinalLabel · $score · Best' : '$ordinalLabel · $score';
    }
    if (attempt.state == SpeakingAttemptState.scoring) {
      return '$ordinalLabel · Scoring…';
    }
    return '$ordinalLabel · Not scored — ${attempt.failure?.message ?? 'Unknown error'}';
  }

  @override
  Widget build(BuildContext context) {
    if (attempts.isEmpty) return const SizedBox.shrink();

    final dark = Theme.of(context).brightness == Brightness.dark;
    final muted = dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant;

    return Semantics(
      container: true,
      label: 'Previous attempts',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var index = 0; index < attempts.length; index++) ...[
            if (index > 0) SizedBox(height: EqSpacing.sm),
            _attemptRow(context, attempts[index], 'Attempt ${attempts[index].ordinal ?? index + 1}', dark, muted),
          ],
        ],
      ),
    );
  }

  Widget _attemptRow(BuildContext context, SpeakingAttemptView attempt, String ordinalLabel, bool dark, Color muted) {
    final canPlay = attempt.state == SpeakingAttemptState.scored || attempt.state == SpeakingAttemptState.failed;
    final isPlaying = playingAttemptId == attempt.id;
    final canRescore = attempt.state == SpeakingAttemptState.failed && (attempt.failure?.rescorable ?? false) && attemptsRemaining > 0;

    return Row(
      children: [
        IconButton(
          icon: Icon(isPlaying ? Icons.stop_circle_outlined : Icons.play_arrow_outlined, size: 20, color: muted),
          tooltip: '${isPlaying ? 'Stop' : 'Play'} $ordinalLabel',
          onPressed: canPlay ? () => onTogglePlay(attempt.id) : null,
        ),
        Expanded(child: Text(_text(attempt, ordinalLabel), style: EqTextStyles.bodyMd(dark: dark))),
        if (canRescore)
          EqButton(
            label: 'Re-score',
            variant: EqButtonVariant.neutral,
            size: EqButtonSize.sm,
            loading: rescoringId == attempt.id,
            loadingLabel: 'Re-scoring…',
            onPressed: () => onRescore(attempt.id),
          ),
      ],
    );
  }
}
