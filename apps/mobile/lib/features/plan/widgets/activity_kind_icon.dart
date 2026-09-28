import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../plan_models.dart';

const _kindGlyphs = <PlanActivityKind, IconData>{
  PlanActivityKind.listening: Icons.headphones_outlined,
  PlanActivityKind.reading: Icons.menu_book_outlined,
  PlanActivityKind.vocabulary: Icons.spellcheck_outlined,
  PlanActivityKind.grammar: Icons.extension_outlined,
  PlanActivityKind.errorReview: Icons.replay_outlined,
  PlanActivityKind.writing: Icons.edit_outlined,
  PlanActivityKind.speaking: Icons.mic_outlined,
  PlanActivityKind.pronunciation: Icons.volume_up_outlined,
};

/// An activity kind's icon, labelled for assistive tech since the icon alone carries the kind.
class ActivityKindIcon extends StatelessWidget {
  const ActivityKindIcon({super.key, required this.kind, this.size = 20});

  final PlanActivityKind kind;
  final double size;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Semantics(
      label: kind.label,
      child: Icon(
        _kindGlyphs[kind],
        size: size,
        color: dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant,
      ),
    );
  }
}
