import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../../design/widgets/eq_card.dart';
import '../../../design/widgets/eq_chip.dart';
import '../plan_models.dart';
import 'activity_kind_icon.dart';
import 'activity_state_badge.dart';

/// One activity: kind icon, title, minutes, state badge, `Carried over` and
/// `Review` chips, and a `Why this activity?` disclosure revealing the
/// rationale and the target tags. [onOpen] is null when the kind has no
/// runner registered yet (F16–F18), so the title isn't tappable.
class PlanActivityCard extends StatefulWidget {
  const PlanActivityCard({super.key, required this.activity, this.onOpen});

  final PlanActivityView activity;
  final VoidCallback? onOpen;

  @override
  State<PlanActivityCard> createState() => _PlanActivityCardState();
}

class _PlanActivityCardState extends State<PlanActivityCard> {
  var _open = false;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final muted = dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant;
    final activity = widget.activity;

    return EqCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              ActivityKindIcon(kind: activity.kind),
              SizedBox(width: EqSpacing.xs),
              Expanded(
                child: widget.onOpen == null
                    ? Text(activity.title, style: EqTextStyles.labelLg(dark: dark))
                    : InkWell(onTap: widget.onOpen, child: Text(activity.title, style: EqTextStyles.labelLg(dark: dark))),
              ),
            ],
          ),
          SizedBox(height: EqSpacing.xs),
          Wrap(
            spacing: EqSpacing.xs,
            runSpacing: EqSpacing.xs,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text('${activity.estimatedMinutes} min', style: EqTextStyles.labelSm(dark: dark).copyWith(color: muted)),
              ActivityStateBadge(state: activity.state),
              if (activity.carriedOver) const EqChip(label: 'Carried over', tone: EqChipTone.accent),
              if (activity.isReview) const EqChip(label: 'Review', tone: EqChipTone.accent),
            ],
          ),
          SizedBox(height: EqSpacing.xs),
          InkWell(
            onTap: () => setState(() => _open = !_open),
            child: Text(
              'Why this activity?',
              style: EqTextStyles.labelSm(dark: dark).copyWith(color: muted, decoration: TextDecoration.underline),
            ),
          ),
          if (_open) ...[
            SizedBox(height: EqSpacing.xs),
            Text(activity.rationale, style: EqTextStyles.bodySm(dark: dark).copyWith(color: muted)),
            if (activity.targetTags.isNotEmpty) ...[
              SizedBox(height: EqSpacing.xs),
              Wrap(
                spacing: EqSpacing.xs,
                runSpacing: EqSpacing.xs,
                children: [for (final tag in activity.targetTags) EqChip(label: tag.label)],
              ),
            ],
          ],
        ],
      ),
    );
  }
}
