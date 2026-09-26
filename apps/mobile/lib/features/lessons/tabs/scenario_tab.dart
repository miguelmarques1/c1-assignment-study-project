import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../design/widgets/eq_page_state.dart';
import '../lesson_detail_controller.dart';
import '../lessons_page.dart';
import '../widgets/palette.dart';
import '../widgets/role_card_panel.dart';
import '../widgets/situation_card.dart';
import 'result_tab.dart';
import 'tab_body.dart';

/// The past lesson's scenario exactly as it was on screen before the lesson:
/// the shared situation and only the viewer's own card — the response has no
/// field for anyone else's.
class ScenarioTab extends StatelessWidget {
  const ScenarioTab({super.key, required this.controller});

  final LessonDetailController controller;

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final palette = LessonPalette.of(context);
      final lesson = controller.detail.data.value!.summary;
      final error = controller.scenario.error.value;
      final view = controller.scenario.data.value;
      final situation = view?.situation;
      final card = view?.myCard;

      return LessonTabBody(
        lesson: lesson,
        onRefresh: controller.loadScenario,
        children: [
          if (error != null)
            EqError(cause: lessonLoadFailure(error, "this lesson's scenario"), onRetry: controller.loadScenario)
          else if (view == null)
            const EqLoading()
          else if (situation == null)
            Text(noScenarioSentence, style: palette.body)
          else ...[
            SituationCard(situation: situation, myRoleLabel: view.myRoleLabel),
            SizedBox(height: EqSpacing.lg),
            if (card != null && card.status != 'pending')
              RoleCardPanel(card: card, roleLabel: view.myRoleLabel)
            else
              Text(
                view.myRoleLabel != null
                    ? 'You played ${view.myRoleLabel}, without a role card.'
                    : 'You had no role card in this lesson.',
                style: palette.body,
              ),
          ],
        ],
      );
    });
  }
}
