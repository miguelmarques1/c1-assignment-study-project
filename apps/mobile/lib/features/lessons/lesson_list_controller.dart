import 'package:get/get.dart';

import '../../core/network/api_exception.dart';
import 'lessons_api.dart';
import 'models/lesson_models.dart';

/// The history list: the first page, `nextCursor` paging for infinite
/// scroll, and a silent refresh the screen runs while anything is pending.
class LessonListController extends GetxController {
  LessonListController(this._api);

  final LessonsApi _api;

  final lessons = <LessonSummary>[].obs;
  final RxnString nextCursor = RxnString();
  final totalStorageBytes = 0.obs;
  final loaded = false.obs;
  final Rxn<ApiException> error = Rxn<ApiException>();
  final loadingMore = false.obs;
  final loadMoreFailed = false.obs;

  /// Whether pages after the first were loaded, which a refresh must keep.
  bool _pagedIn = false;

  bool get hasPending => lessons.any((lesson) => lesson.status.isPending);

  /// Loads (or re-loads) the first page. A refresh keeps whatever was paged
  /// in after it, so polling never throws away rows the viewer scrolled to.
  Future<void> load() async {
    error.value = null;
    try {
      final page = await _api.list();
      if (_pagedIn) {
        final fresh = {for (final lesson in page.lessons) lesson.lessonId};
        lessons.assignAll([...page.lessons, ...lessons.where((lesson) => !fresh.contains(lesson.lessonId))]);
      } else {
        lessons.assignAll(page.lessons);
        nextCursor.value = page.nextCursor;
      }
      totalStorageBytes.value = page.totalStorageBytes;
      loaded.value = true;
    } on ApiException catch (failure) {
      error.value = failure;
    }
  }

  Future<void> loadMore() async {
    final cursor = nextCursor.value;
    if (cursor == null || loadingMore.value) return;
    loadingMore.value = true;
    loadMoreFailed.value = false;
    try {
      final page = await _api.list(cursor: cursor);
      final known = {for (final lesson in lessons) lesson.lessonId};
      lessons.addAll(page.lessons.where((lesson) => !known.contains(lesson.lessonId)));
      nextCursor.value = page.nextCursor;
      _pagedIn = true;
    } on ApiException {
      loadMoreFailed.value = true;
    } finally {
      loadingMore.value = false;
    }
  }
}
