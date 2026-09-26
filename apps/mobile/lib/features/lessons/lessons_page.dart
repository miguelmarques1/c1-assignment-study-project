import 'dart:async';

import 'package:dio/dio.dart';
import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_modular/flutter_modular.dart';
import 'package:get/get.dart';

import '../../core/network/api_exception.dart';
import '../../design/widgets/eq_page_state.dart';
import 'lesson_format.dart';
import 'lesson_list_controller.dart';
import 'lessons_api.dart';
import 'widgets/lesson_row.dart';
import 'widgets/palette.dart';

/// How often a screen with something still moving refreshes itself (F19, A20).
const lessonPollInterval = Duration(seconds: 10);

/// How close to the end of the list, in dp, the next page starts loading.
const _loadMoreThreshold = 400.0;

/// Content stays readable on a tablet instead of stretching edge to edge.
const lessonContentMaxWidth = 560.0;

/// Offline shows the transport's own message, as every F03 screen does; any
/// other failure says what could not be loaded.
String lessonLoadFailure(ApiException error, String what) =>
    error.cause == ApiFailureCause.noConnection ? error.message : 'We could not load $what.';

/// The Lessons tab (F19): every lesson the viewer took part in, newest
/// first, with their own status — infinite scroll, pull-to-refresh, and a
/// 10 s refresh while anything is still processing or blocked.
class LessonsPage extends StatefulWidget {
  const LessonsPage({super.key, this.api, this.onOpenLesson});

  /// Tests pass a [LessonsApi] over a scripted `Dio`; the app uses the shared one.
  final LessonsApi? api;

  /// Tests observe navigation here; the app pushes the detail inside the Lessons tab.
  final void Function(String lessonId)? onOpenLesson;

  @override
  State<LessonsPage> createState() => _LessonsPageState();
}

class _LessonsPageState extends State<LessonsPage> {
  late final LessonListController _controller = LessonListController(widget.api ?? LessonsApi(inject<Dio>()));
  final _scroll = ScrollController();
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _controller.load();
    _scroll.addListener(_maybeLoadMore);
    _poll = Timer.periodic(lessonPollInterval, (_) {
      if (mounted && TickerMode.valuesOf(context).enabled && _controller.hasPending) _controller.load();
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    _scroll.dispose();
    super.dispose();
  }

  void _maybeLoadMore() {
    if (_scroll.position.extentAfter < _loadMoreThreshold) _controller.loadMore();
  }

  void _open(String lessonId) {
    final open = widget.onOpenLesson;
    if (open != null) {
      open(lessonId);
    } else {
      context.pushNamed('/app/lessons/$lessonId');
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = LessonPalette.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Lessons')),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: lessonContentMaxWidth),
            child: RefreshIndicator(
              onRefresh: _controller.load,
              child: Obx(() {
                final error = _controller.error.value;
                final loaded = _controller.loaded.value;
                final lessons = _controller.lessons.toList();
                final padding = EdgeInsets.all(EqSpacing.marginMobile);

                if (!loaded) {
                  return ListView(
                    padding: padding,
                    children: [
                      if (error != null)
                        EqError(cause: lessonLoadFailure(error, 'your lessons'), onRetry: _controller.load)
                      else
                        const EqLoading(blockCount: 4, blockHeight: 96),
                    ],
                  );
                }
                if (lessons.isEmpty) {
                  return ListView(
                    padding: padding,
                    children: [
                      EqEmpty(
                        message: 'No lessons yet.\nA lesson appears here as soon as it ends.',
                        actionLabel: 'Refresh',
                        onAction: _controller.load,
                      ),
                    ],
                  );
                }

                return ListView.separated(
                  controller: _scroll,
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: padding,
                  itemCount: lessons.length + 2,
                  separatorBuilder: (_, _) => SizedBox(height: EqSpacing.gutterMobile),
                  itemBuilder: (context, index) {
                    if (index == 0) {
                      return Text(
                        'Recordings use ${formatBytes(_controller.totalStorageBytes.value)} of storage.',
                        style: palette.bodySm,
                      );
                    }
                    if (index == lessons.length + 1) {
                      if (_controller.loadingMore.value) return const EqLoading(blockCount: 1, blockHeight: 96);
                      if (_controller.loadMoreFailed.value) {
                        return Center(
                          child: TextButton(onPressed: _controller.loadMore, child: const Text('Load more lessons')),
                        );
                      }
                      return const SizedBox.shrink();
                    }
                    final lesson = lessons[index - 1];
                    return LessonRow(key: ValueKey(lesson.lessonId), lesson: lesson, onOpen: () => _open(lesson.lessonId));
                  },
                );
              }),
            ),
          ),
        ),
      ),
    );
  }
}
