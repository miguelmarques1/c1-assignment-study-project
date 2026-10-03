import 'dart:async';

import 'package:dio/dio.dart';
import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_modular/flutter_modular.dart';
import 'package:get/get.dart';

import '../../design/widgets/eq_button.dart';
import '../../design/widgets/eq_page_state.dart';
import '../profile/profile_controller.dart';
import 'widgets/checking_view.dart';
import 'widgets/submit_confirmation_sheet.dart';
import 'widgets/writing_editor.dart';
import 'widgets/writing_result_view.dart';
import 'widgets/writing_task_card.dart';
import 'word_count.dart';
import 'writing_api.dart';
import 'writing_controller.dart';
import 'writing_draft_store.dart';
import 'writing_models.dart';

/// `Scaffold` and `SafeArea` with an app bar (the activity title, and back,
/// which pops when possible and otherwise goes to `/app/today`). The body
/// switches on state like the web: loading, error (the `ApiException`
/// message, with `No connection` on first load), the editor, the checking
/// view, the result, or read-only (spec §4).
class WritingPage extends StatefulWidget {
  const WritingPage({
    super.key,
    required this.activityId,
    this.api,
    this.draftStore,
    this.profile,
    this.onBackToToday,
    this.onGoToSettings,
    this.onSeeFullPlan,
    this.onBackToPlan,
  });

  final String activityId;
  final WritingApi? api;
  final WritingDraftStore? draftStore;
  final ProfileController? profile;

  /// Tests observe navigation here; the app switches to the Today tab — the back
  /// button's fallback when there is nothing to pop, and the result's `Back to today`.
  final VoidCallback? onBackToToday;

  /// Tests observe navigation here; the app switches to the Settings tab.
  final VoidCallback? onGoToSettings;

  /// Tests observe navigation here; the app switches to the Plan tab.
  final VoidCallback? onSeeFullPlan;

  /// Tests observe navigation here; the app switches to the Plan tab — the
  /// read-only (not corrected) view's `Back to plan`.
  final VoidCallback? onBackToPlan;

  @override
  State<WritingPage> createState() => _WritingPageState();
}

class _WritingPageState extends State<WritingPage> {
  late final WritingController _controller = WritingController(
    widget.api ?? WritingApi(inject<Dio>()),
    widget.draftStore ?? WritingDraftStore(),
    widget.activityId,
  );
  late final ProfileController _profile = widget.profile ?? ProfileController(inject<Dio>());

  Timer? _localSaveTimer;
  Timer? _serverSaveTimer;
  Timer? _pollTimer;
  AppLifecycleListener? _lifecycleListener;

  @override
  void initState() {
    super.initState();
    _controller.open();
    _localSaveTimer = Timer.periodic(writingLocalSaveInterval, (_) {
      if (mounted) _controller.saveLocalIfChanged();
    });
    _serverSaveTimer = Timer.periodic(writingServerSaveInterval, (_) {
      if (mounted) _controller.saveServerIfChanged();
    });
    _pollTimer = Timer.periodic(writingPollInterval, (_) {
      if (mounted && _controller.isCorrecting) _controller.pollWhileCorrecting();
    });
    _lifecycleListener = AppLifecycleListener(
      onPause: () => unawaited(_controller.flushOnPause()),
      onResume: () => unawaited(_controller.reconcileOnResume()),
    );
  }

  @override
  void dispose() {
    _localSaveTimer?.cancel();
    _serverSaveTimer?.cancel();
    _pollTimer?.cancel();
    _lifecycleListener?.dispose();
    super.dispose();
  }

  void _back() {
    if (Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    } else if (widget.onBackToToday != null) {
      widget.onBackToToday!();
    } else {
      context.navigate('/app/today');
    }
  }

  Future<void> _onSubmitPressed() async {
    await showSubmitConfirmationSheet(
      context,
      onSubmit: () async {
        final succeeded = await _controller.submit();
        if (!succeeded && _controller.conflict.value != null && mounted) {
          // The conflict banner now owns the screen; close the sheet rather than showing a generic error over it.
          Navigator.of(context).pop(false);
        }
        return succeeded;
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      switch (_controller.loadState.value) {
        case WritingLoadState.loading:
          return Scaffold(
            appBar: AppBar(title: const Text('Writing'), leading: BackButton(onPressed: _back)),
            body: SafeArea(child: Padding(padding: EdgeInsets.all(EqSpacing.marginMobile), child: const EqLoading(blockCount: 5, blockHeight: 48))),
          );
        case WritingLoadState.error:
          final message = _controller.loadError.value?.message ?? 'Something went wrong';
          return Scaffold(
            appBar: AppBar(title: const Text('Writing'), leading: BackButton(onPressed: _back)),
            body: SafeArea(child: Padding(padding: EdgeInsets.all(EqSpacing.marginMobile), child: EqError(cause: message, onRetry: _controller.reload))),
          );
        case WritingLoadState.ready:
          final view = _controller.view.value!;
          return Scaffold(
            appBar: AppBar(title: Text(view.title), leading: BackButton(onPressed: _back)),
            body: SafeArea(child: _body(view)),
          );
      }
    });
  }

  Widget _body(WritingActivityView view) {
    if (view.readOnly) {
      return _ReadOnlyBody(view: view, profile: _profile, onBackToToday: widget.onBackToToday, onSeeFullPlan: widget.onSeeFullPlan, onBackToPlan: widget.onBackToPlan);
    }
    if (view.status == WritingTaskStatus.correcting) {
      return SingleChildScrollView(
        padding: EdgeInsets.all(EqSpacing.marginMobile),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            WritingTaskCard(task: view.task, defaultExpanded: false),
            SizedBox(height: EqSpacing.md),
            CheckingView(text: view.draft.text),
          ],
        ),
      );
    }
    if (view.status == WritingTaskStatus.corrected && view.correction != null) {
      return WritingResultView(correction: view.correction!, profile: _profile, onBackToToday: widget.onBackToToday, onSeeFullPlan: widget.onSeeFullPlan);
    }
    return _EditableBody(controller: _controller, view: view, onSubmitPressed: _onSubmitPressed, onGoToSettings: widget.onGoToSettings);
  }
}

class _EditableBody extends StatelessWidget {
  const _EditableBody({required this.controller, required this.view, required this.onSubmitPressed, this.onGoToSettings});

  final WritingController controller;
  final WritingActivityView view;
  final Future<void> Function() onSubmitPressed;
  final VoidCallback? onGoToSettings;

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final text = controller.text.value;
      final wordCount = countWords(text);
      final limit = view.submission.dailyLimit;
      final limitReached = limit.used >= limit.max;
      final canSubmit =
          !controller.submitting.value &&
          controller.conflict.value == null &&
          view.submission.geminiKeyUsable &&
          !limitReached &&
          wordCount >= writingMinSubmitWords &&
          wordCount <= writingMaxSubmitWords;

      return Padding(
        padding: EdgeInsets.all(EqSpacing.marginMobile),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            WritingTaskCard(task: view.task, defaultExpanded: text.trim().isEmpty),
            SizedBox(height: EqSpacing.md),
            Expanded(
              child: WritingEditor(
                text: text,
                onTextChange: controller.setText,
                wordCount: wordCount,
                saveState: controller.saveState.value,
                savedAt: controller.savedAt.value,
                geminiKeyUsable: view.submission.geminiKeyUsable,
                limit: limit,
                now: view.serverTime,
                failureMessage: view.failure?.message,
                onRetryFailure: () => unawaited(controller.retryCorrection()),
                retryingFailure: controller.submitting.value,
                conflict: controller.conflict.value,
                localVersionText: controller.localVersionText.value,
                onContinueWithLatest: () => unawaited(controller.continueWithConflict()),
                canSubmit: canSubmit,
                onSubmitPressed: () => unawaited(onSubmitPressed()),
                onGoToSettings: onGoToSettings,
              ),
            ),
          ],
        ),
      );
    });
  }
}

class _ReadOnlyBody extends StatelessWidget {
  const _ReadOnlyBody({required this.view, required this.profile, this.onBackToToday, this.onSeeFullPlan, this.onBackToPlan});

  final WritingActivityView view;
  final ProfileController profile;
  final VoidCallback? onBackToToday;
  final VoidCallback? onSeeFullPlan;
  final VoidCallback? onBackToPlan;

  @override
  Widget build(BuildContext context) {
    if (view.status == WritingTaskStatus.corrected && view.correction != null) {
      return WritingResultView(correction: view.correction!, profile: profile, onBackToToday: onBackToToday, onSeeFullPlan: onSeeFullPlan);
    }

    final dark = Theme.of(context).brightness == Brightness.dark;
    final onSurface = dark ? EqDarkColors.onSurface : EqLightColors.onSurface;
    final outline = dark ? EqDarkColors.outlineStrong : EqLightColors.outlineStrong;
    final surface = dark ? EqDarkColors.surfaceContainer : EqLightColors.surfaceContainer;

    return ListView(
      padding: EdgeInsets.all(EqSpacing.marginMobile),
      children: [
        WritingTaskCard(task: view.task, defaultExpanded: true),
        SizedBox(height: EqSpacing.md),
        Container(
          width: double.infinity,
          padding: EdgeInsets.all(EqSpacing.md),
          decoration: BoxDecoration(color: surface, borderRadius: BorderRadius.circular(EqRadius.md), border: Border.all(color: outline, width: 2)),
          child: Text(view.draft.text, style: EqTextStyles.bodyMd(dark: dark).copyWith(color: onSurface)),
        ),
        SizedBox(height: EqSpacing.lg),
        EqButton(label: 'Back to plan', variant: EqButtonVariant.neutral, onPressed: onBackToPlan ?? () => context.navigate('/app/plan')),
      ],
    );
  }
}
