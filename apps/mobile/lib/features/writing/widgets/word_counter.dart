import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../writing_models.dart';

enum _WordBand { below, ok, tooLong }

_WordBand _bandOf(int count) {
  if (count < writingMinSubmitWords) return _WordBand.below;
  if (count > writingMaxSubmitWords) return _WordBand.tooLong;
  return _WordBand.ok;
}

/// The web's copy and colour roles (spec §4): grey below the 80-word
/// minimum, tertiary with a check once it is met, a neutral hint past the
/// expected upper bound, and error past the hard maximum. A `Semantics`
/// live region announces only threshold crossings.
class WordCounter extends StatelessWidget {
  const WordCounter({super.key, required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final band = _bandOf(count);
    final color = switch (band) {
      _WordBand.below => dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant,
      _WordBand.ok => dark ? EqDarkColors.tertiary : EqLightColors.tertiary,
      _WordBand.tooLong => dark ? EqDarkColors.error : EqLightColors.error,
    };
    final label = band == _WordBand.below ? '$count of $writingMinSubmitWords words' : '$count words';
    final announcement = switch (band) {
      _WordBand.below => label,
      _WordBand.ok => '$count words, ready to submit',
      _WordBand.tooLong => 'Too long to correct: keep it under $writingMaxSubmitWords words.',
    };

    return Semantics(
      liveRegion: true,
      label: announcement,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(label, style: EqTextStyles.labelMd(dark: dark).copyWith(color: color)),
              if (band == _WordBand.ok) ...[
                SizedBox(width: EqSpacing.xs),
                Icon(Icons.check_circle_outline, size: 16, color: color),
              ],
            ],
          ),
          if (band == _WordBand.ok && count > writingExpectedWordsMax)
            Text('Aim for $writingExpectedWordsMin–$writingExpectedWordsMax words.', style: EqTextStyles.bodySm(dark: dark).copyWith(color: color)),
          if (band == _WordBand.tooLong)
            Text(
              'Too long to correct: keep it under $writingMaxSubmitWords words.',
              style: EqTextStyles.bodySm(dark: dark).copyWith(color: color),
            ),
        ],
      ),
    );
  }
}
