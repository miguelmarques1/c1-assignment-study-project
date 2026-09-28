import 'dart:async';

import 'package:dio/dio.dart';
import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_modular/flutter_modular.dart';
import 'package:get/get.dart';

import '../../design/widgets/eq_button.dart';
import '../../design/widgets/eq_page_state.dart';
import '../plan/activity_routes.dart';
import '../plan/current_plan_controller.dart';
import '../plan/plan_models.dart';
import '../plan/plan_today.dart';
import '../plan/plans_api.dart';
import '../plan/widgets/activity_kind_icon.dart';
import '../plan/widgets/activity_state_badge.dart';
import '../plan/widgets/plan_status_banner.dart';
import '../plan/widgets/session_summary.dart';

/// How often the tab refreshes itself while a build is still preparing.
const todayPollInterval = Duration(seconds: 10);

/// The Today tab: what to do today, wherever the plan currently stands
/// (A16) — the mobile counterpart of the dashboard's `TodaySessionCard`.
class TodayPage extends StatefulWidget {
  const TodayPage({super.key, this.api, this.onOpenActivity, this.onSeeFullPlan});

  final PlansApi? api;

  /// Tests observe navigation here; the app pushes the activity's own runner.
  final void Function(String path)? onOpenActivity;

  /// Tests observe navigation here; the app switches to the Plan tab.
  final VoidCallback? onSeeFullPlan;

  @override
  State<TodayPage> createState() => _TodayPageState();
}

class _TodayPageState extends State<TodayPage> {
  late final CurrentPlanController _controller = CurrentPlanController(widget.api ?? PlansApi(inject<Dio>()));
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _controller.load();
    _poll = Timer.periodic(todayPollInterval, (_) {
      if (mounted && TickerMode.valuesOf(context).enabled && _controller.isPreparing) _controller.load();
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  void _seeFullPlan() {
    final onSeeFullPlan = widget.onSeeFullPlan;
    if (onSeeFullPlan != null) {
      onSeeFullPlan();
    } else {
      context.navigate('/app/plan');
    }
  }

  void _openActivity(PlanActivityView activity) {
    final path = activityRouteFor(activity);
    if (path == null) return;
    final open = widget.onOpenActivity;
    if (open != null) {
      open(path);
    } else {
      context.navigate(path);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final padding = EdgeInsets.all(EqSpacing.marginMobile);

    return Obx(() {
      final view = _controller.current.value;
      final error = _controller.error.value;

      Widget body;
      if (!_controller.loaded.value) {
        body = error != null
            ? EqError(cause: error.message, onRetry: _controller.load)
            : const EqLoading(blockCount: 4, blockHeight: 64);
      } else {
        final plan = view!.plan;

        if (plan == null) {
          if (view.preparing != null || view.failure != null) {
            body = PlanStatusBanner(
              preparing: view.preparing,
              failure: view.failure,
              retrying: _controller.retrying.value,
              onRetry: _controller.retry,
            );
          } else {
            body = const EqEmpty(message: 'Your study plan appears after your first lesson.');
          }
        } else {
          final selection = selectTodaySession(plan, DateTime.now());
          final session = selection.session;

          if (session == null) {
            body = const Text('You have completed every session in this plan.');
          } else if (selection.mode == TodayMode.completedToday) {
            body = Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SessionSummary(summary: session.summary, completionPercent: plan.progress.completionPercent),
                SizedBox(height: EqSpacing.md),
                EqButton(label: 'Work ahead in Plan', onPressed: _seeFullPlan, variant: EqButtonVariant.neutral),
              ],
            );
          } else {
            PlanActivityView? next;
            for (final activity in session.activities) {
              if (activity.state == PlanActivityState.pending || activity.state == PlanActivityState.inProgress) {
                next = activity;
                break;
              }
            }
            final nextPath = next == null ? null : activityRouteFor(next);

            body = Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Day ${session.day} · ${session.estimatedMinutes} min', style: EqTextStyles.bodyMd(dark: dark)),
                SizedBox(height: EqSpacing.sm),
                for (final activity in session.activities) ...[
                  Row(
                    children: [
                      ActivityKindIcon(kind: activity.kind, size: 16),
                      SizedBox(width: EqSpacing.xs),
                      Expanded(child: Text(activity.title, style: EqTextStyles.bodySm(dark: dark))),
                      SizedBox(width: EqSpacing.xs),
                      Text('${activity.estimatedMinutes} min', style: EqTextStyles.labelSm(dark: dark)),
                      SizedBox(width: EqSpacing.xs),
                      ActivityStateBadge(state: activity.state),
                    ],
                  ),
                  SizedBox(height: EqSpacing.xs),
                ],
                SizedBox(height: EqSpacing.sm),
                if (nextPath != null) ...[
                  EqButton(label: 'Start session', onPressed: () => _openActivity(next!)),
                  SizedBox(height: EqSpacing.sm),
                ],
                EqButton(label: 'See the full plan', onPressed: _seeFullPlan, variant: EqButtonVariant.neutral),
              ],
            );
          }
        }
      }

      return Scaffold(
        appBar: AppBar(title: const Text('Today')),
        body: SafeArea(
          child: RefreshIndicator(
            onRefresh: _controller.load,
            child: ListView(padding: padding, children: [body]),
          ),
        ),
      );
    });
  }
}
