import 'dart:async';

import 'package:dio/dio.dart';
import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_modular/flutter_modular.dart';
import 'package:get/get.dart';

import '../../design/widgets/eq_button.dart';
import '../../design/widgets/eq_page_state.dart';
import '../profile/ledger_entry_sheet.dart';
import '../profile/profile_controller.dart';
import 'lesson_detail_controller.dart';
import 'lessons_api.dart';
import 'lessons_page.dart';
import 'tabs/result_tab.dart';
import 'tabs/scenario_tab.dart';
import 'tabs/status_tab.dart';
import 'tabs/transcript_tab.dart';
import 'widgets/palette.dart';

/// The lesson detail, pushed inside the Lessons tab: the same four areas as
/// the web's sub-routes (Result, Scenario, Transcript, Status) as tabs, each
/// loading and failing on its own, and refreshing every 10 s while the
/// viewer's own processing is still moving. There is no audio anywhere.
class LessonDetailPage extends StatefulWidget {
  const LessonDetailPage({super.key, required this.lessonId, this.api, this.profile, this.onNavigate});

  final String lessonId;

  /// Tests pass a [LessonsApi] over a scripted `Dio`; the app uses the shared one.
  final LessonsApi? api;

  /// Resolves an error's tag to its ledger record (F12); tests pass one over a scripted `Dio`.
  final ProfileController? profile;

  /// Tests observe navigation here (the settings link); the app switches tab.
  final void Function(String path)? onNavigate;

  @override
  State<LessonDetailPage> createState() => _LessonDetailPageState();
}

class _LessonDetailPageState extends State<LessonDetailPage> with SingleTickerProviderStateMixin {
  late final LessonDetailController _controller =
      LessonDetailController(widget.api ?? LessonsApi(inject<Dio>()), widget.lessonId);
  late final ProfileController _profile = widget.profile ?? ProfileController(inject<Dio>());
  late final TabController _tabs;
  String? _anchoredUtterance;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    // Created here, not lazily: a detail that never shows its tabs (not
    // available, failed to load) would otherwise build it inside dispose().
    _tabs = TabController(length: 4, vsync: this);
    _controller.loadAll();
    _poll = Timer.periodic(lessonPollInterval, (_) {
      if (mounted && TickerMode.valuesOf(context).enabled && _controller.hasPending) _controller.loadAll();
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    _tabs.dispose();
    super.dispose();
  }

  void _navigate(String path) {
    final navigate = widget.onNavigate;
    if (navigate != null) {
      navigate(path);
    } else {
      context.navigate(path);
    }
  }

  /// The error-card chip's destination: the tag's record in the ledger, as a
  /// bottom sheet over the lesson. A tag with no record yet opens nothing.
  Future<void> _openTag(String tag) async {
    try {
      await showLedgerEntrySheetForTag(context, _profile, tag, onOpenLesson: _openLesson);
    } on DioException {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Your error ledger could not be opened.')));
    }
  }

  /// A lesson source in the ledger sheet: this lesson is already open, any other replaces it.
  void _openLesson(String lessonId) {
    if (lessonId != widget.lessonId) _navigate('/app/lessons/$lessonId');
  }

  void _openTranscriptAt(String utteranceId) {
    setState(() => _anchoredUtterance = utteranceId);
    _tabs.animateTo(2);
  }

  /// Back to the list: pop when the detail was pushed from it, else go there.
  void _back() {
    final navigator = Navigator.maybeOf(context);
    if (navigator != null && navigator.canPop()) {
      navigator.pop();
    } else {
      _navigate('/app/lessons');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final detail = _controller.detail.data.value;
      final error = _controller.detail.error.value;
      final padding = EdgeInsets.all(EqSpacing.marginMobile);

      if (detail == null) {
        final Widget body;
        if (error != null && (error.code == 'CLASS004' || error.code == 'VAL001')) {
          body = _Unavailable(onBack: _back);
        } else if (error != null) {
          body = ListView(
            padding: padding,
            children: [EqError(cause: lessonLoadFailure(error, 'this lesson'), onRetry: _controller.loadDetail)],
          );
        } else {
          body = Padding(padding: padding, child: const EqLoading(blockCount: 5, blockHeight: 48));
        }
        return Scaffold(appBar: AppBar(title: const Text('Lesson')), body: SafeArea(child: body));
      }

      return Scaffold(
        appBar: AppBar(
          title: Text(detail.summary.scenarioTitle ?? 'Conversation lesson', maxLines: 1, overflow: TextOverflow.ellipsis),
          bottom: TabBar(
            controller: _tabs,
            isScrollable: true,
            tabs: const [Tab(text: 'Result'), Tab(text: 'Scenario'), Tab(text: 'Transcript'), Tab(text: 'Status')],
          ),
        ),
        body: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: lessonContentMaxWidth),
              child: TabBarView(
                controller: _tabs,
                children: [
                  ResultTab(
                    controller: _controller,
                    onSeeInTranscript: _openTranscriptAt,
                    onOpenStatus: () => _tabs.animateTo(3),
                    onNavigate: _navigate,
                    onOpenTag: _openTag,
                  ),
                  ScenarioTab(controller: _controller),
                  TranscriptTab(controller: _controller, anchoredUtteranceId: _anchoredUtterance),
                  StatusTab(controller: _controller, onNavigate: _navigate),
                ],
              ),
            ),
          ),
        ),
      );
    });
  }
}

/// A lesson the viewer did not take part in (`CLASS004`).
class _Unavailable extends StatelessWidget {
  const _Unavailable({required this.onBack});

  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final palette = LessonPalette.of(context);
    return Center(
      child: Padding(
        padding: EdgeInsets.all(EqSpacing.marginMobile),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text("This lesson isn't available to you.", style: palette.bodyLg, textAlign: TextAlign.center),
            SizedBox(height: EqSpacing.md),
            EqButton(label: 'Back to lessons', onPressed: onBack, variant: EqButtonVariant.neutral),
          ],
        ),
      ),
    );
  }
}
