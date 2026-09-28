import 'package:dio/dio.dart';
import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_modular/flutter_modular.dart';
import 'package:get/get.dart';

import '../../core/format/relative_time.dart';
import '../../design/widgets/eq_badge.dart';
import '../../design/widgets/eq_card.dart';
import '../../design/widgets/eq_chip.dart';
import '../../design/widgets/eq_page_state.dart';
import 'plan_history_controller.dart';
import 'plan_models.dart';
import 'plans_api.dart';

/// The caller's previous plans, newest first, each opening its read-only detail.
class PlanHistoryPage extends StatefulWidget {
  const PlanHistoryPage({super.key, this.api, this.onOpenPlan});

  final PlansApi? api;

  /// Tests observe navigation here; the app pushes the plan's detail.
  final void Function(String planId)? onOpenPlan;

  @override
  State<PlanHistoryPage> createState() => _PlanHistoryPageState();
}

class _PlanHistoryPageState extends State<PlanHistoryPage> {
  late final PlanHistoryController _controller = PlanHistoryController(widget.api ?? PlansApi(inject<Dio>()));

  @override
  void initState() {
    super.initState();
    _controller.load();
  }

  void _open(String planId) {
    final open = widget.onOpenPlan;
    if (open != null) {
      open(planId);
    } else {
      context.pushNamed('/app/plan/$planId');
    }
  }

  List<String> _ratingParts(PlanRatingCounts ratings) => [
    if (ratings.tooEasy > 0) '${ratings.tooEasy} too easy',
    if (ratings.justRight > 0) '${ratings.justRight} just right',
    if (ratings.tooHard > 0) '${ratings.tooHard} too hard',
    if (ratings.notUseful > 0) '${ratings.notUseful} not useful',
  ];

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final padding = EdgeInsets.all(EqSpacing.marginMobile);

    return Scaffold(
      appBar: AppBar(title: const Text('Previous plans')),
      body: SafeArea(
        child: Obx(() {
          final error = _controller.error.value;
          if (!_controller.loaded.value) {
            return ListView(
              padding: padding,
              children: [
                if (error != null)
                  EqError(cause: error.message, onRetry: _controller.load)
                else
                  const EqLoading(blockCount: 4, blockHeight: 96),
              ],
            );
          }

          final plans = _controller.plans;
          if (plans.isEmpty) {
            return ListView(padding: padding, children: const [EqEmpty(message: 'No previous plans yet.')]);
          }

          return RefreshIndicator(
            onRefresh: _controller.load,
            child: ListView.separated(
              padding: padding,
              itemCount: plans.length,
              separatorBuilder: (_, _) => SizedBox(height: EqSpacing.gutterMobile),
              itemBuilder: (context, index) {
                final item = plans[index];
                final ratings = _ratingParts(item.ratings);
                return Semantics(
                  button: true,
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => _open(item.id),
                    child: EqCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Text(
                                  '${formatShortDate(item.lessonDate)} · ${item.origin.label}',
                                  style: EqTextStyles.labelMd(dark: dark).copyWith(color: EqLightColors.onSurfaceVariant),
                                ),
                              ),
                              if (item.status == StudyPlanStatus.active) const EqBadge(status: EqBadgeStatus.info, label: 'Current'),
                            ],
                          ),
                          SizedBox(height: EqSpacing.xs),
                          Text('${item.completedCount} of ${item.activityCount} completed · ${item.completionPercent}%'),
                          if (ratings.isNotEmpty) ...[
                            SizedBox(height: EqSpacing.xs),
                            Wrap(
                              spacing: EqSpacing.xs,
                              runSpacing: EqSpacing.xs,
                              children: [for (final label in ratings) EqChip(label: label)],
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          );
        }),
      ),
    );
  }
}
