import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../plan_models.dart';

/// One line per note, already ordered by the server (the failed-recording note first).
class PlanNotes extends StatelessWidget {
  const PlanNotes({super.key, required this.notes});

  final List<PlanNote> notes;

  @override
  Widget build(BuildContext context) {
    if (notes.isEmpty) return const SizedBox.shrink();
    final dark = Theme.of(context).brightness == Brightness.dark;
    final muted = dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final note in notes)
          Padding(
            padding: EdgeInsets.only(bottom: EqSpacing.xs),
            child: Text(note.text, style: EqTextStyles.bodySm(dark: dark).copyWith(color: muted)),
          ),
      ],
    );
  }
}
