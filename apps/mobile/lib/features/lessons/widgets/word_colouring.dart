import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../models/transcript_models.dart';
import 'palette.dart';

/// Word-level colouring with a non-colour cue for every band — a solid
/// underline for `poor`, a dotted one for `fair`, none for `good` — and the
/// score and error types in each word's semantics label (F19, A16).
class WordColouring extends StatelessWidget {
  const WordColouring({super.key, required this.words});

  final List<AssessedWord> words;

  static TextStyle styleFor(WordBand band, LessonPalette palette) => switch (band) {
    WordBand.good => TextStyle(color: palette.tertiary),
    WordBand.fair => TextStyle(
      color: palette.warning,
      decoration: TextDecoration.underline,
      decorationStyle: TextDecorationStyle.dotted,
      decorationThickness: 2,
    ),
    WordBand.poor => TextStyle(
      color: palette.error,
      decoration: TextDecoration.underline,
      decorationStyle: TextDecorationStyle.solid,
      decorationThickness: 2,
    ),
  };

  @override
  Widget build(BuildContext context) {
    final palette = LessonPalette.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: EqSpacing.sm,
          runSpacing: EqSpacing.xs,
          children: [
            for (final word in words)
              Semantics(
                label: word.spokenLabel,
                excludeSemantics: true,
                child: Text(word.text, style: palette.bodyLg.merge(styleFor(word.band, palette))),
              ),
          ],
        ),
        SizedBox(height: EqSpacing.xs),
        ExcludeSemantics(
          child: Wrap(
            spacing: EqSpacing.md,
            children: [
              Text('Good (80+)', style: palette.bodySm.merge(styleFor(WordBand.good, palette))),
              Text('Fair (60–79)', style: palette.bodySm.merge(styleFor(WordBand.fair, palette))),
              Text('Needs work (below 60)', style: palette.bodySm.merge(styleFor(WordBand.poor, palette))),
            ],
          ),
        ),
      ],
    );
  }
}
