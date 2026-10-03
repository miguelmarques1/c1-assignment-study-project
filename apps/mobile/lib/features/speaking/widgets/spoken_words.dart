import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../lessons/models/transcript_models.dart';
import '../../lessons/widgets/palette.dart';
import '../../lessons/widgets/word_colouring.dart';
import '../speaking_models.dart';

/// F19's word colouring (A26), reusing `WordColouring.styleFor`. A `poor`
/// word with known offsets is a button calling [onPlayRange]; an unassessed
/// token (`band == null`) renders in the muted variant colour.
class SpokenWords extends StatelessWidget {
  const SpokenWords({super.key, required this.words, this.onPlayRange});

  final List<SpeakingWord> words;
  final void Function(int startMs, int durationMs)? onPlayRange;

  @override
  Widget build(BuildContext context) {
    final palette = LessonPalette.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Wrap(
          spacing: EqSpacing.sm,
          runSpacing: EqSpacing.xs,
          children: [
            for (final word in words)
              Semantics(
                label: word.spokenLabel,
                excludeSemantics: true,
                button: _isPlayable(word),
                child: _isPlayable(word)
                    ? GestureDetector(
                        onTap: () => onPlayRange!(word.startMs!, word.durationMs!),
                        child: Text(word.text, style: palette.bodyLg.merge(WordColouring.styleFor(word.band!, palette))),
                      )
                    : Text(
                        word.text,
                        style: word.band == null
                            ? palette.bodyLg.copyWith(color: palette.onSurfaceVariant)
                            : palette.bodyLg.merge(WordColouring.styleFor(word.band!, palette)),
                      ),
              ),
          ],
        ),
        SizedBox(height: EqSpacing.xs),
        ExcludeSemantics(
          child: Wrap(
            spacing: EqSpacing.md,
            children: [
              Text('Good (80+)', style: palette.bodySm.merge(WordColouring.styleFor(WordBand.good, palette))),
              Text('Fair (60–79)', style: palette.bodySm.merge(WordColouring.styleFor(WordBand.fair, palette))),
              Text('Needs work (below 60)', style: palette.bodySm.merge(WordColouring.styleFor(WordBand.poor, palette))),
            ],
          ),
        ),
      ],
    );
  }

  bool _isPlayable(SpeakingWord word) =>
      word.band == WordBand.poor && onPlayRange != null && word.startMs != null && word.durationMs != null;
}
