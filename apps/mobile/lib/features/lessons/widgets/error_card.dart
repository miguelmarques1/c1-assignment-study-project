import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../../design/widgets/eq_badge.dart';
import '../../../design/widgets/eq_card.dart';
import '../../../design/widgets/eq_chip.dart';
import '../models/analysis_models.dart';
import 'palette.dart';

/// One tagged error: the quote in quotation marks, the correction with its
/// changed span emphasized (server-built), the explanation, the tag, the
/// ledger's recurrence badge and a way to the moment in the transcript. The
/// tag chip stays plain until F12's ledger detail exists (F19, A14).
class ErrorCard extends StatelessWidget {
  const ErrorCard({super.key, required this.error, this.onSeeInTranscript});

  final AnalysisErrorView error;
  final VoidCallback? onSeeInTranscript;

  @override
  Widget build(BuildContext context) {
    final palette = LessonPalette.of(context);

    return EqCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            label: 'You said: ${error.quote}',
            excludeSemantics: true,
            child: Text('“${error.quote}”', style: palette.bodyLg.copyWith(color: palette.onSurfaceVariant)),
          ),
          SizedBox(height: EqSpacing.xs),
          Semantics(
            label: 'Correction: ${error.correction}',
            excludeSemantics: true,
            child: Text.rich(
              TextSpan(
                children: [
                  for (final (index, segment) in error.correctionSegments.indexed)
                    TextSpan(
                      text: index == 0 ? segment.text : ' ${segment.text}',
                      style: segment.changed
                          ? TextStyle(
                              color: palette.primary,
                              fontWeight: FontWeight.w800,
                              decoration: TextDecoration.underline,
                              decorationThickness: 2,
                            )
                          : null,
                    ),
                ],
              ),
              style: palette.bodyLg.copyWith(color: palette.onSurface),
            ),
          ),
          SizedBox(height: EqSpacing.sm),
          Text(error.explanation, style: palette.body),
          SizedBox(height: EqSpacing.sm),
          Wrap(
            spacing: EqSpacing.sm,
            runSpacing: EqSpacing.xs,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              EqChip(label: error.tagLabel),
              if (error.recurrence != null) EqBadge(status: EqBadgeStatus.warning, label: error.recurrence!.label),
              if (onSeeInTranscript != null)
                TextButton(onPressed: onSeeInTranscript, child: const Text('See in transcript')),
            ],
          ),
        ],
      ),
    );
  }
}
