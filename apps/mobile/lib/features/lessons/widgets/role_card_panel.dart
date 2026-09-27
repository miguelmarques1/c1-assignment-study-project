import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../../design/widgets/eq_chip.dart';
import '../models/scenario_models.dart';
import 'palette.dart';

/// The caller's own private briefing, marked private in its first line — the
/// web's `RoleCardPanel` for a past lesson (ready or failed; never pending).
class RoleCardPanel extends StatelessWidget {
  const RoleCardPanel({super.key, required this.card, required this.roleLabel});

  final RoleCard card;
  final String? roleLabel;

  @override
  Widget build(BuildContext context) {
    final palette = LessonPalette.of(context);
    final ready = card.status == 'ready';

    return Semantics(
      container: true,
      label: 'Your role card',
      child: DecoratedBox(
        decoration: palette.outlined(color: palette.dangerBg),
        child: Padding(
          padding: EdgeInsets.all(EqSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Wrap(
                spacing: EqSpacing.sm,
                runSpacing: EqSpacing.xs,
                children: [
                  const EqChip(label: 'Only you can see this', tone: EqChipTone.accent),
                  if (ready && card.register != null) EqChip(label: registerLabels[card.register] ?? card.register!),
                ],
              ),
              SizedBox(height: EqSpacing.md),
              if (!ready) ...[
                Text('Your role card could not be generated. You could still play this role.', style: palette.body),
                if (roleLabel != null) ...[
                  SizedBox(height: EqSpacing.xs),
                  Text('Your role: $roleLabel', style: palette.title),
                ],
              ] else ...[
                if (roleLabel != null) Text('You are $roleLabel', style: palette.titleLg),
                if (card.background != null) ...[
                  SizedBox(height: EqSpacing.xs),
                  Text(card.background!, style: palette.body),
                ],
                SizedBox(height: EqSpacing.md),
                _Briefing(title: 'Your objective:', text: card.objective ?? '', color: palette.primary),
                SizedBox(height: EqSpacing.sm),
                _Briefing(title: 'Your constraint:', text: card.constraint ?? '', color: palette.error),
                if ((card.targetExpressions ?? const []).isNotEmpty) ...[
                  SizedBox(height: EqSpacing.md),
                  Text('EXPRESSIONS TO TRY', style: palette.labelSm),
                  SizedBox(height: EqSpacing.sm),
                  Wrap(
                    spacing: EqSpacing.sm,
                    runSpacing: EqSpacing.sm,
                    children: [for (final expression in card.targetExpressions!) EqChip(label: expression)],
                  ),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Briefing extends StatelessWidget {
  const _Briefing({required this.title, required this.text, required this.color});

  final String title;
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final palette = LessonPalette.of(context);
    return DecoratedBox(
      decoration: palette.outlined(radius: EqRadius.md, shadow: false),
      child: Padding(
        padding: EdgeInsets.all(EqSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: palette.label.copyWith(color: color)),
            SizedBox(height: EqSpacing.xs),
            Text(text, style: palette.body),
          ],
        ),
      ),
    );
  }
}
