import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../models/lesson_models.dart';
import '../widgets/lesson_header.dart';

/// A tab's scrollable body: the lesson header first — the same on every tab,
/// as the web renders it above every area — then the area's own content.
class LessonTabBody extends StatelessWidget {
  const LessonTabBody({super.key, required this.lesson, required this.children, this.onRefresh});

  final LessonSummary lesson;
  final List<Widget> children;
  final Future<void> Function()? onRefresh;

  @override
  Widget build(BuildContext context) {
    final list = ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.all(EqSpacing.marginMobile),
      children: [LessonHeader(lesson: lesson), SizedBox(height: EqSpacing.md), ...children],
    );
    final refresh = onRefresh;
    return refresh == null ? list : RefreshIndicator(onRefresh: refresh, child: list);
  }
}
