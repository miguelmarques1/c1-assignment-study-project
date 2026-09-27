import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../../design/widgets/eq_chip.dart';
import '../models/scenario_models.dart';
import 'palette.dart';

/// The shared situation, read-only — the web's `SituationCard` without its
/// reroll control, since a past lesson's scenario can no longer change.
class SituationCard extends StatelessWidget {
  const SituationCard({super.key, required this.situation, required this.myRoleLabel});

  final SharedSituation situation;
  final String? myRoleLabel;

  @override
  Widget build(BuildContext context) {
    final palette = LessonPalette.of(context);

    return Semantics(
      container: true,
      label: "Today's situation",
      child: DecoratedBox(
        decoration: palette.outlined(),
        child: Padding(
          padding: EdgeInsets.all(EqSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Align(alignment: Alignment.centerLeft, child: EqChip(label: situation.vocabularyDomain)),
              SizedBox(height: EqSpacing.md),
              if (situation.title != null) ...[
                Text(situation.title!, style: palette.titleLg),
                SizedBox(height: EqSpacing.xs),
              ],
              Text('“${situation.setting} ${situation.premise}”', style: palette.bodyLg.copyWith(color: palette.onSurfaceVariant)),
              SizedBox(height: EqSpacing.md),
              Text('ROLES IN THIS CONVERSATION', style: palette.labelSm.copyWith(color: palette.onSurfaceVariant)),
              SizedBox(height: EqSpacing.sm),
              for (final role in situation.roles)
                Padding(
                  padding: EdgeInsets.only(bottom: EqSpacing.sm),
                  child: DecoratedBox(
                    decoration: palette.outlined(
                      color: role.label == myRoleLabel ? palette.dangerBg : palette.surfaceContainerLowest,
                      radius: EqRadius.md,
                      shadow: false,
                    ),
                    child: Padding(
                      padding: EdgeInsets.all(EqSpacing.md),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(role.label == myRoleLabel ? 'YOUR ROLE' : 'ANOTHER ROLE', style: palette.labelSm),
                          SizedBox(height: EqSpacing.xs),
                          Text(role.label, style: palette.title),
                          Text(role.relationship, style: palette.body.copyWith(color: palette.onSurfaceVariant)),
                        ],
                      ),
                    ),
                  ),
                ),
              SizedBox(height: EqSpacing.sm),
              Text('TALK ABOUT', style: palette.labelSm.copyWith(color: palette.onSurfaceVariant)),
              SizedBox(height: EqSpacing.sm),
              for (final hook in situation.discussionHooks)
                Padding(
                  padding: EdgeInsets.only(bottom: EqSpacing.xs),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.check_circle_outline, size: 20, color: palette.onSurface),
                      SizedBox(width: EqSpacing.sm),
                      Expanded(child: Text(hook, style: palette.body)),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
