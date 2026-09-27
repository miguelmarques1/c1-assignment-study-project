import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../lesson_format.dart';
import '../models/transcript_models.dart';
import 'palette.dart';
import 'word_colouring.dart';

/// The checklist's minimum touch target, in dp.
const _minTouchTarget = 48.0;

/// One transcript line: its clock, the speaker, the text, and — on the
/// caller's own selected lines only — the score badge that expands to the
/// word colouring, the selection reason and the five scores.
class UtteranceTile extends StatefulWidget {
  const UtteranceTile({super.key, required this.utterance, required this.speaker, required this.mine, this.highlighted = false});

  final TranscriptUtterance utterance;
  final String speaker;
  final bool mine;
  final bool highlighted;

  @override
  State<UtteranceTile> createState() => _UtteranceTileState();
}

class _UtteranceTileState extends State<UtteranceTile> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final palette = LessonPalette.of(context);
    final excerpt = widget.utterance.excerpt;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: widget.highlighted ? palette.primaryContainer : null,
        borderRadius: BorderRadius.circular(EqRadius.md),
        border: Border.all(color: widget.highlighted ? palette.outlineStrong : Colors.transparent, width: 2),
      ),
      child: Padding(
        padding: EdgeInsets.all(EqSpacing.sm),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: EqSpacing.xl + EqSpacing.lg,
              child: Text(formatClock(widget.utterance.startMs), style: palette.labelSm.copyWith(color: palette.onSurfaceVariant)),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(widget.speaker, style: palette.label.copyWith(color: widget.mine ? palette.primary : palette.onSurfaceVariant)),
                  Text(widget.utterance.text, style: palette.body),
                  if (excerpt != null) ...[
                    SizedBox(height: EqSpacing.xs),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Semantics(
                        button: true,
                        expanded: _open,
                        label: 'Pronunciation score ${excerpt.pronunciation.badgeText}',
                        excludeSemantics: true,
                        child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: () => setState(() => _open = !_open),
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(minHeight: _minTouchTarget, minWidth: _minTouchTarget),
                            child: Align(
                              alignment: Alignment.centerLeft,
                              widthFactor: 1,
                              child: DecoratedBox(
                                key: const Key('excerpt-badge'),
                                decoration: palette.outlined(color: palette.infoBg, radius: EqRadius.full, shadow: false),
                                child: Padding(
                                  padding: EdgeInsets.symmetric(horizontal: EqSpacing.sm, vertical: EqSpacing.xs),
                                  child: Text(excerpt.pronunciation.badgeText, style: palette.labelSm.copyWith(color: palette.infoFg)),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                    if (_open) _ExcerptDetail(excerpt: excerpt),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ExcerptDetail extends StatelessWidget {
  const _ExcerptDetail({required this.excerpt});

  final TranscriptExcerpt excerpt;

  @override
  Widget build(BuildContext context) {
    final palette = LessonPalette.of(context);
    final scores = excerpt.pronunciation.scores;
    final words = excerpt.assessedWords;

    return Padding(
      padding: EdgeInsets.only(top: EqSpacing.sm),
      child: DecoratedBox(
        decoration: palette.outlined(color: palette.surfaceContainer, radius: EqRadius.md, shadow: false),
        child: Padding(
          padding: EdgeInsets.all(EqSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (words != null && words.isNotEmpty) ...[
                WordColouring(words: words),
                SizedBox(height: EqSpacing.sm),
              ],
              Text(excerpt.reason, style: palette.bodySm),
              SizedBox(height: EqSpacing.sm),
              if (scores == null)
                Text(
                  excerpt.pronunciation.status == 'pending'
                      ? 'This excerpt has not been assessed yet.'
                      : 'This excerpt could not be assessed.',
                  style: palette.bodySm,
                )
              else
                Wrap(
                  spacing: EqSpacing.md,
                  runSpacing: EqSpacing.xs,
                  children: [
                    for (final (label, value) in [
                      ('Pronunciation', scores.pronunciation),
                      ('Accuracy', scores.accuracy),
                      ('Fluency', scores.fluency),
                      ('Prosody', scores.prosody),
                      ('Completeness', scores.completeness),
                    ])
                      Text('$label ${value == null ? 'Not measured' : value.round()}', style: palette.label),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}
