import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../writing_models.dart';
import 'error_detail_sheet.dart';

/// The submitted text with inline error highlights (spec §4). A highlighted
/// segment is its own tappable `Text`, embedded as a [WidgetSpan] so the
/// surrounding prose still flows as one paragraph. A tap (or activation via
/// `Semantics`) opens a bottom sheet with the tag, correction and
/// explanation.
class HighlightedText extends StatelessWidget {
  const HighlightedText({super.key, required this.segments, required this.errors});

  final List<WritingHighlightSegment> segments;
  final List<WritingErrorView> errors;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final onSurface = dark ? EqDarkColors.onSurface : EqLightColors.onSurface;
    final highlightBg = dark ? EqDarkColors.badgeDangerBg : EqLightColors.badgeDangerBg;
    final highlightFg = dark ? EqDarkColors.badgeDangerFg : EqLightColors.badgeDangerFg;

    final spans = <InlineSpan>[
      for (final segment in segments)
        if (segment.errorIndexes.isEmpty)
          TextSpan(text: segment.text, style: EqTextStyles.bodyMd(dark: dark).copyWith(color: onSurface))
        else
          WidgetSpan(
            alignment: PlaceholderAlignment.baseline,
            baseline: TextBaseline.alphabetic,
            child: _Highlight(
              segment: segment,
              errors: errors,
              style: EqTextStyles.bodyMd(dark: dark).copyWith(color: highlightFg, backgroundColor: highlightBg, decoration: TextDecoration.underline, decorationThickness: 2),
            ),
          ),
    ];

    return Text.rich(TextSpan(children: spans));
  }
}

class _Highlight extends StatelessWidget {
  const _Highlight({required this.segment, required this.errors, required this.style});

  final WritingHighlightSegment segment;
  final List<WritingErrorView> errors;
  final TextStyle style;

  @override
  Widget build(BuildContext context) {
    final segmentErrors = [for (final index in segment.errorIndexes) errors[index]];

    return Semantics(
      button: true,
      label: '${segment.text} — ${segmentErrors.map((error) => error.tagLabel).join(', ')}',
      child: GestureDetector(
        onTap: () => showErrorDetailSheet(context, segmentErrors.first),
        child: Text(segment.text, style: style),
      ),
    );
  }
}
