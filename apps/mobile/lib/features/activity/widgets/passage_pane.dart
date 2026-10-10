import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../activity_models.dart';
import 'palette.dart';

/// The text (or, after a listening submission, the transcript) in its own
/// independently scrolling pane, so it stays readable while the questions are
/// answered (A23). [maxHeight] caps it so the questions keep their share of a
/// phone screen; leave it null where the parent already bounds it.
class PassagePane extends StatelessWidget {
  const PassagePane({super.key, required this.passage, this.source, this.maxHeight});

  final ObjectivePassage passage;
  final ObjectiveSource? source;
  final double? maxHeight;

  @override
  Widget build(BuildContext context) {
    final palette = EqPalette.of(context);

    return DecoratedBox(
      decoration: palette.box(shadow: true),
      child: Padding(
        padding: EdgeInsets.all(EqSpacing.md),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(passage.heading, style: EqTextStyles.labelLg(dark: palette.dark)),
            SizedBox(height: EqSpacing.xs),
            Flexible(
              child: ConstrainedBox(
                constraints: BoxConstraints(maxHeight: maxHeight ?? double.infinity),
                child: Semantics(
                  label: passage.heading,
                  container: true,
                  child: SingleChildScrollView(child: Text(passage.text, style: EqTextStyles.bodyLg(dark: palette.dark))),
                ),
              ),
            ),
            if (source != null) ...[
              SizedBox(height: EqSpacing.sm),
              Text('Source: ${source!.name}', style: EqTextStyles.bodySm(dark: palette.dark)),
            ],
          ],
        ),
      ),
    );
  }
}
