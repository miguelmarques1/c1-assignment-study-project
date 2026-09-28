import 'package:dio/dio.dart';
import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_modular/flutter_modular.dart';
import 'package:get/get.dart';

import '../../core/format/relative_time.dart';
import '../../design/widgets/eq_meter.dart';
import '../../design/widgets/eq_page_state.dart';
import 'plan_detail_controller.dart';
import 'plans_api.dart';
import 'widgets/plan_day_tile.dart';
import 'widgets/plan_notes.dart';

/// A past plan, read-only: no status banner, no retry, every day starts
/// collapsed. The active plan's own id redirects to the Plan tab instead of
/// duplicating its live view here.
class PlanDetailPage extends StatefulWidget {
  const PlanDetailPage({super.key, required this.planId, this.api, this.onRedirectToCurrent});

  final String planId;
  final PlansApi? api;

  /// Tests observe the redirect here; the app switches to the Plan tab.
  final VoidCallback? onRedirectToCurrent;

  @override
  State<PlanDetailPage> createState() => _PlanDetailPageState();
}

class _PlanDetailPageState extends State<PlanDetailPage> {
  late final PlanDetailController _controller = PlanDetailController(widget.api ?? PlansApi(inject<Dio>()), widget.planId);
  var _redirected = false;

  @override
  void initState() {
    super.initState();
    _controller.load();
  }

  void _redirectToCurrent() {
    if (_redirected) return;
    _redirected = true;
    final onRedirect = widget.onRedirectToCurrent;
    if (onRedirect != null) {
      onRedirect();
    } else {
      context.navigate('/app/plan');
    }
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final padding = EdgeInsets.all(EqSpacing.marginMobile);

    return Obx(() {
      if (_controller.isActivePlan.value) {
        WidgetsBinding.instance.addPostFrameCallback((_) => _redirectToCurrent());
        return const Scaffold(body: SizedBox.shrink());
      }

      final plan = _controller.plan.value;
      final error = _controller.error.value;

      if (plan == null) {
        return Scaffold(
          appBar: AppBar(title: const Text('Plan')),
          body: SafeArea(
            child: ListView(
              padding: padding,
              children: [
                if (error != null)
                  EqError(cause: error.message, onRetry: _controller.load)
                else
                  const EqLoading(blockCount: 5, blockHeight: 64),
              ],
            ),
          ),
        );
      }

      final carriedOver = plan.sessions.expand((session) => session.activities).where((activity) => activity.carriedOver).length;

      return Scaffold(
        appBar: AppBar(title: const Text('Plan')),
        body: SafeArea(
          child: ListView(
            padding: padding,
            children: [
              Text(
                '${plan.origin.label} · ${formatShortDate(plan.lessonDate)}',
                style: EqTextStyles.labelMd(dark: dark).copyWith(color: EqLightColors.onSurfaceVariant),
              ),
              if (plan.archivedAt != null) ...[
                SizedBox(height: EqSpacing.xs),
                Text('Archived ${formatRelativeTime(plan.archivedAt!)}'),
              ],
              SizedBox(height: EqSpacing.md),
              Text(plan.summaryLine, style: EqTextStyles.bodyMd(dark: dark)),
              SizedBox(height: EqSpacing.sm),
              EqMeter(label: 'Plan progress', value: plan.progress.completionPercent),
              if (carriedOver > 0) ...[
                SizedBox(height: EqSpacing.xs),
                Text('$carriedOver carried over from the previous plan'),
              ],
              SizedBox(height: EqSpacing.md),
              PlanNotes(notes: plan.notes),
              SizedBox(height: EqSpacing.sm),
              for (final session in plan.sessions) ...[
                PlanDayTile(session: session, isToday: false),
                SizedBox(height: EqSpacing.sm),
              ],
            ],
          ),
        ),
      );
    });
  }
}
