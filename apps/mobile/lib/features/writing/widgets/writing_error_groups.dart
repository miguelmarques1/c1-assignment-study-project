import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../../design/widgets/eq_badge.dart';
import '../../../design/widgets/eq_chip.dart';
import '../../../design/widgets/eq_page_state.dart';
import '../../profile/ledger_entry_sheet.dart';
import '../../profile/profile_controller.dart';
import '../writing_models.dart';

/// One section per tag: the tag chip opening the ledger record, a badge for
/// the recurrence label, and a count. Each error shows its quote, the
/// correction with changed spans emphasized, and the explanation. `EqEmpty`
/// when there are none (spec §4).
class WritingErrorGroups extends StatelessWidget {
  const WritingErrorGroups({super.key, required this.groups, required this.errors, this.profile});

  final List<WritingErrorGroupView> groups;
  final List<WritingErrorView> errors;

  /// Resolves a tag chip tap to the caller's ledger record. Omitted in tests
  /// that don't need the tap to do anything.
  final ProfileController? profile;

  @override
  Widget build(BuildContext context) {
    if (groups.isEmpty) {
      return const EqEmpty(message: 'No errors found in this text.');
    }

    final dark = Theme.of(context).brightness == Brightness.dark;
    final onSurface = dark ? EqDarkColors.onSurface : EqLightColors.onSurface;
    final onSurfaceVariant = dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant;
    final outline = dark ? EqDarkColors.outlineStrong : EqLightColors.outlineStrong;
    final surface = dark ? EqDarkColors.surfaceContainerLowest : EqLightColors.surfaceContainerLowest;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final group in groups) ...[
          Padding(
            padding: EdgeInsets.only(bottom: EqSpacing.sm),
            child: Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: EqSpacing.sm,
              runSpacing: EqSpacing.xs,
              children: [
                _TagChip(tag: group.tag, label: group.tagLabel, profile: profile),
                if (group.recurrence != null) EqBadge(status: EqBadgeStatus.warning, label: group.recurrence!.label),
                Text(
                  '${group.errorIndexes.length} ${group.errorIndexes.length == 1 ? 'error' : 'errors'}',
                  style: EqTextStyles.labelSm(dark: dark).copyWith(color: onSurfaceVariant),
                ),
              ],
            ),
          ),
          for (final index in group.errorIndexes) ...[
            Container(
              width: double.infinity,
              margin: EdgeInsets.only(bottom: EqSpacing.sm),
              padding: EdgeInsets.all(EqSpacing.md),
              decoration: BoxDecoration(
                color: surface,
                borderRadius: BorderRadius.circular(EqRadius.md),
                border: Border.all(color: outline, width: 2),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('“${errors[index].quote}”', style: EqTextStyles.bodyMd(dark: dark).copyWith(color: onSurface)),
                  SizedBox(height: EqSpacing.xs),
                  Text.rich(
                    TextSpan(
                      style: EqTextStyles.bodySm(dark: dark).copyWith(color: onSurfaceVariant),
                      children: [const TextSpan(text: 'Correction: '), ..._correctionSpans(errors[index], dark)],
                    ),
                  ),
                  SizedBox(height: EqSpacing.xs),
                  Text(errors[index].explanation, style: EqTextStyles.bodySm(dark: dark).copyWith(color: onSurfaceVariant)),
                ],
              ),
            ),
          ],
          SizedBox(height: EqSpacing.sm),
        ],
      ],
    );
  }

  List<InlineSpan> _correctionSpans(WritingErrorView error, bool dark) {
    final primary = dark ? EqDarkColors.primary : EqLightColors.primary;
    final spans = <InlineSpan>[];
    for (var i = 0; i < error.correctionSegments.length; i++) {
      final segment = error.correctionSegments[i];
      if (i > 0) spans.add(const TextSpan(text: ' '));
      spans.add(
        TextSpan(
          text: segment.text,
          style: segment.changed
              ? EqTextStyles.bodySm(dark: dark).copyWith(color: primary, fontWeight: FontWeight.bold, decoration: TextDecoration.underline)
              : null,
        ),
      );
    }
    return spans;
  }
}

class _TagChip extends StatelessWidget {
  const _TagChip({required this.tag, required this.label, required this.profile});

  final String tag;
  final String label;
  final ProfileController? profile;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: '$label: open in your error ledger',
      child: InkWell(
        onTap: () {
          final controller = profile;
          if (controller != null) {
            showLedgerEntrySheetForTag(context, controller, tag);
          }
        },
        child: EqChip(label: label, tone: EqChipTone.accent),
      ),
    );
  }
}
