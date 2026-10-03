import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../../design/widgets/eq_meter.dart';
import '../speaking_models.dart';
import 'spoken_words.dart';

/// The scored view of one attempt: coloured words, the five score meters and
/// the phonemes still worth drilling. Mirrors the web's `attempt-result.tsx`.
class AttemptResult extends StatelessWidget {
  const AttemptResult({super.key, required this.result, required this.shape, required this.onPlayRange});

  final SpeakingAttemptResult result;
  final SpeakingShape shape;
  final void Function(int startMs, int durationMs) onPlayRange;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final scores = result.scores;
    final muted = dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (shape == SpeakingShape.openResponse && result.transcript != null) ...[
          Text('Transcript', style: EqTextStyles.titleMd(dark: dark)),
          SizedBox(height: EqSpacing.sm),
        ],
        SpokenWords(words: result.words, onPlayRange: onPlayRange),
        SizedBox(height: EqSpacing.lg),
        EqMeter(label: 'Pronunciation', value: scores.pronunciation.round()),
        SizedBox(height: EqSpacing.sm),
        EqMeter(label: 'Accuracy', value: scores.accuracy.round()),
        SizedBox(height: EqSpacing.sm),
        EqMeter(label: 'Fluency', value: scores.fluency.round()),
        SizedBox(height: EqSpacing.sm),
        if (scores.prosody == null)
          Row(
            children: [
              Expanded(child: Text('Prosody', style: EqTextStyles.labelMd(dark: dark).copyWith(color: muted))),
              Text('Not measured', style: EqTextStyles.labelMd(dark: dark).copyWith(color: muted)),
            ],
          )
        else
          EqMeter(label: 'Prosody', value: scores.prosody!.round()),
        SizedBox(height: EqSpacing.sm),
        EqMeter(label: 'Completeness', value: scores.completeness.round()),
        if (result.failingPhonemes.isNotEmpty) ...[
          SizedBox(height: EqSpacing.lg),
          Text('Sounds to work on', style: EqTextStyles.titleMd(dark: dark)),
          SizedBox(height: EqSpacing.sm),
          for (final phoneme in result.failingPhonemes)
            Padding(
              padding: EdgeInsets.only(bottom: EqSpacing.xs),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '${phoneme.label} — ${phoneme.meanAccuracy.round()}, "${phoneme.exampleWord}"',
                      style: EqTextStyles.bodyMd(dark: dark),
                    ),
                  ),
                  if (phoneme.exampleStartMs != null && phoneme.exampleDurationMs != null)
                    IconButton(
                      icon: Icon(Icons.play_arrow_outlined, size: 20, color: muted),
                      tooltip: 'Play example for ${phoneme.label}',
                      onPressed: () => onPlayRange(phoneme.exampleStartMs!, phoneme.exampleDurationMs!),
                    ),
                ],
              ),
            ),
        ],
      ],
    );
  }
}
