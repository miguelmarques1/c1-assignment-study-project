import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../design/widgets/eq_page_state.dart';
import '../lesson_detail_controller.dart';
import '../lessons_page.dart';
import '../widgets/lesson_header.dart';
import '../widgets/stage_stepper.dart';
import 'tab_body.dart';

/// The viewer's full stepper, with reasons, the settings link and retries,
/// then one coarse stepper per other participant.
class StatusTab extends StatelessWidget {
  const StatusTab({super.key, required this.controller, required this.onNavigate});

  final LessonDetailController controller;
  final void Function(String path) onNavigate;

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final detail = controller.detail.data.value!;
      final error = controller.pipeline.error.value;
      final pipeline = controller.pipeline.data.value;

      return LessonTabBody(
        lesson: detail.summary,
        onRefresh: controller.loadAll,
        children: [
          LessonSection(
            title: 'Your processing',
            children: [
              if (error != null)
                EqError(cause: lessonLoadFailure(error, 'your processing status'), onRetry: controller.loadStatus)
              else if (pipeline == null)
                const EqLoading()
              else
                OwnStepper(
                  detail: detail,
                  pipeline: pipeline,
                  recording: controller.recording.data.value,
                  retrying: controller.retrying.value,
                  retryMessage: controller.retryMessage.value,
                  onRetry: ({required bool recordingStep}) => controller.retry(recordingStep: recordingStep),
                  onOpenSettings: () => onNavigate('/app/settings'),
                ),
            ],
          ),
          if (detail.others.isNotEmpty)
            LessonSection(
              title: 'Other participants',
              children: [
                for (final other in detail.others)
                  Padding(padding: EdgeInsets.only(bottom: EqSpacing.md), child: OtherStepper(other: other)),
              ],
            ),
        ],
      );
    });
  }
}
