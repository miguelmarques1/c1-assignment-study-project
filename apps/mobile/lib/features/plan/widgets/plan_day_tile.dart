import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../activity_routes.dart';
import '../plan_models.dart';
import 'plan_activity_card.dart';

/// One of the plan's 7 days, collapsed unless it's `Today`'s. `isToday` is
/// often unknown when this first builds (the page needs the device's own
/// clock, resolved after the first frame), so `didUpdateWidget` also opens
/// the tile when `isToday` turns true later — never closing one the viewer
/// opened themselves.
class PlanDayTile extends StatefulWidget {
  const PlanDayTile({super.key, required this.session, required this.isToday, this.onOpenActivity});

  final PlanSessionView session;
  final bool isToday;
  final void Function(PlanActivityView activity)? onOpenActivity;

  @override
  State<PlanDayTile> createState() => _PlanDayTileState();
}

class _PlanDayTileState extends State<PlanDayTile> {
  late var _open = widget.isToday;

  @override
  void didUpdateWidget(PlanDayTile oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isToday && !oldWidget.isToday) setState(() => _open = true);
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final session = widget.session;
    final done = session.activities.where((activity) => activity.state == PlanActivityState.completed).length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        InkWell(
          onTap: () => setState(() => _open = !_open),
          child: Container(
            padding: EdgeInsets.symmetric(horizontal: EqSpacing.md, vertical: EqSpacing.sm),
            decoration: BoxDecoration(
              color: dark ? EqDarkColors.surfaceContainerLowest : EqLightColors.surfaceContainerLowest,
              borderRadius: BorderRadius.circular(EqRadius.md),
              border: Border.all(color: dark ? EqDarkColors.outlineStrong : EqLightColors.outlineStrong, width: 2),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Day ${session.day} · ${session.estimatedMinutes} min · $done of ${session.activities.length} done',
                    style: EqTextStyles.labelLg(dark: dark),
                  ),
                ),
                Icon(_open ? Icons.expand_less : Icons.expand_more),
              ],
            ),
          ),
        ),
        if (_open)
          Padding(
            padding: EdgeInsets.only(top: EqSpacing.sm),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final activity in session.activities) ...[
                  PlanActivityCard(
                    activity: activity,
                    onOpen: activityRouteFor(activity) == null ? null : () => widget.onOpenActivity?.call(activity),
                  ),
                  if (activity != session.activities.last) SizedBox(height: EqSpacing.sm),
                ],
              ],
            ),
          ),
      ],
    );
  }
}
