import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_modular/flutter_modular.dart';

import '../../../design/widgets/eq_button.dart';
import '../../../design/widgets/eq_card.dart';
import '../../../design/widgets/eq_meter.dart';
import '../../profile/profile_controller.dart';
import '../writing_models.dart';
import 'highlighted_text.dart';
import 'revised_text.dart';
import 'writing_error_groups.dart';

/// The correction result (spec §4): the comment, a toggle between the
/// original and the revision, four score meters with no delta, and the
/// grouped errors.
class WritingResultView extends StatefulWidget {
  const WritingResultView({super.key, required this.correction, this.profile, this.onBackToToday, this.onSeeFullPlan});

  final WritingCorrectionView correction;
  final ProfileController? profile;

  /// Tests observe navigation here; the app switches to the Today tab.
  final VoidCallback? onBackToToday;

  /// Tests observe navigation here; the app switches to the Plan tab.
  final VoidCallback? onSeeFullPlan;

  @override
  State<WritingResultView> createState() => _WritingResultViewState();
}

class _WritingResultViewState extends State<WritingResultView> {
  bool _showRevised = false;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final onSurface = dark ? EqDarkColors.onSurface : EqLightColors.onSurface;

    return ListView(
      padding: EdgeInsets.all(EqSpacing.marginMobile),
      children: [
        EqCard(
          tone: EqCardTone.primary,
          header: Text('Overall', style: EqTextStyles.titleMd(dark: dark).copyWith(color: onSurface)),
          child: Text(widget.correction.overallComment, style: EqTextStyles.bodyMd(dark: dark).copyWith(color: onSurface)),
        ),
        SizedBox(height: EqSpacing.lg),
        Row(
          children: [
            Expanded(
              child: EqButton(
                label: 'Your text',
                variant: _showRevised ? EqButtonVariant.neutral : EqButtonVariant.primary,
                size: EqButtonSize.sm,
                onPressed: () => setState(() => _showRevised = false),
              ),
            ),
            SizedBox(width: EqSpacing.sm),
            Expanded(
              child: EqButton(
                label: 'Revised version',
                variant: _showRevised ? EqButtonVariant.primary : EqButtonVariant.neutral,
                size: EqButtonSize.sm,
                onPressed: () => setState(() => _showRevised = true),
              ),
            ),
          ],
        ),
        SizedBox(height: EqSpacing.md),
        _showRevised
            ? RevisedText(segments: widget.correction.revision)
            : HighlightedText(segments: widget.correction.text, errors: widget.correction.errors),
        SizedBox(height: EqSpacing.lg),
        for (final score in widget.correction.scores) ...[
          EqMeter(label: score.label, value: score.score),
          SizedBox(height: EqSpacing.sm),
        ],
        SizedBox(height: EqSpacing.md),
        WritingErrorGroups(groups: widget.correction.errorGroups, errors: widget.correction.errors, profile: widget.profile),
        SizedBox(height: EqSpacing.lg),
        EqButton(label: 'Back to today', onPressed: widget.onBackToToday ?? () => context.navigate('/app/today')),
        SizedBox(height: EqSpacing.sm),
        EqButton(
          label: 'See the full plan',
          variant: EqButtonVariant.neutral,
          onPressed: widget.onSeeFullPlan ?? () => context.navigate('/app/plan'),
        ),
      ],
    );
  }
}
