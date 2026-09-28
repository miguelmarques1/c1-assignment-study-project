import 'dart:async';

import 'package:dio/dio.dart';
import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_modular/flutter_modular.dart';
import 'package:get/get.dart';

import '../../design/widgets/eq_button.dart';
import '../../design/widgets/eq_meter.dart';
import '../../design/widgets/eq_page_state.dart';
import 'activity_routes.dart';
import 'current_plan_controller.dart';
import 'plan_models.dart';
import 'plan_today.dart';
import 'plans_api.dart';
import 'widgets/plan_day_tile.dart';
import 'widgets/plan_notes.dart';
import 'widgets/plan_status_banner.dart';

/// How often the tab refreshes itself while a build is still preparing.
const planPollInterval = Duration(seconds: 10);

/// Content stays readable on a tablet instead of stretching edge to edge.
const planContentMaxWidth = 560.0;

/// The Plan tab (F15): the status banner, the plan's summary and notes, its
/// 7 expandable days, and an entry into the previous-plans history.
class PlanPage extends StatefulWidget {
  const PlanPage({super.key, this.api, this.onOpenActivity});

  /// Tests pass a [PlansApi] over a scripted `Dio`; the app uses the shared one.
  final PlansApi? api;

  /// Tests observe navigation here; the app pushes the activity's own runner.
  final void Function(String path)? onOpenActivity;

  @override
  State<PlanPage> createState() => _PlanPageState();
}

class _PlanPageState extends State<PlanPage> {
  late final CurrentPlanController _controller = CurrentPlanController(widget.api ?? PlansApi(inject<Dio>()));
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _controller.load();
    _poll = Timer.periodic(planPollInterval, (_) {
      if (mounted && TickerMode.valuesOf(context).enabled && _controller.isPreparing) _controller.load();
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
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

  void _openHistory() {
    if (widget.onOpenActivity != null) {
      widget.onOpenActivity!('/app/plan/history');
    } else {
      context.pushNamed('/app/plan/history');
    }
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Obx(() {
      final view = _controller.current.value;
      final error = _controller.error.value;
      final padding = EdgeInsets.all(EqSpacing.marginMobile);

      Widget body;
      if (!_controller.loaded.value) {
        body = error != null
            ? EqError(cause: error.message, onRetry: _controller.load)
            : const EqLoading(blockCount: 5, blockHeight: 64);
      } else {
        final plan = view!.plan;
        final today = plan == null ? null : selectTodaySession(plan, DateTime.now());
        final carriedOver = plan == null
            ? 0
            : plan.sessions.expand((session) => session.activities).where((activity) => activity.carriedOver).length;

        body = Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            PlanStatusBanner(
              preparing: view.preparing,
              failure: view.failure,
              retrying: _controller.retrying.value,
              onRetry: _controller.retry,
            ),
            if (plan != null) ...[
              SizedBox(height: EqSpacing.md),
              Text(plan.summaryLine, style: EqTextStyles.bodyMd(dark: dark)),
              SizedBox(height: EqSpacing.sm),
              EqMeter(label: 'Plan progress', value: plan.progress.completionPercent),
              if (carriedOver > 0) ...[
                SizedBox(height: EqSpacing.xs),
                Text('$carriedOver carried over from your previous plan'),
              ],
              SizedBox(height: EqSpacing.md),
              PlanNotes(notes: plan.notes),
              SizedBox(height: EqSpacing.sm),
              for (final session in plan.sessions) ...[
                PlanDayTile(
                  session: session,
                  isToday: today?.session?.day == session.day,
                  onOpenActivity: _openActivity,
                ),
                SizedBox(height: EqSpacing.sm),
              ],
            ] else if (view.preparing == null && view.failure == null) ...[
              SizedBox(height: EqSpacing.xl),
              const EqEmpty(message: 'Your study plan appears after your first lesson.'),
            ],
            SizedBox(height: EqSpacing.md),
            EqButton(label: 'Previous plans', onPressed: _openHistory, variant: EqButtonVariant.neutral),
          ],
        );
      }

      return Scaffold(
        appBar: AppBar(title: const Text('Plan')),
        body: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: planContentMaxWidth),
              child: RefreshIndicator(
                onRefresh: _controller.load,
                child: ListView(padding: padding, children: [body]),
              ),
            ),
          ),
        ),
      );
    });
  }
}
