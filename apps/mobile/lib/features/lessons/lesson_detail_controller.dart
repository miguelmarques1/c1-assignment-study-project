import 'package:get/get.dart';

import '../../core/network/api_exception.dart';
import 'lessons_api.dart';
import 'models/analysis_models.dart';
import 'models/lesson_models.dart';
import 'models/pipeline_models.dart';
import 'models/pronunciation_models.dart';
import 'models/recording_models.dart';
import 'models/scenario_models.dart';
import 'models/transcript_models.dart';

/// One area's read: its data once loaded, or the failure that area shows
/// on its own while the header and the other tabs stay usable.
class AreaState<T> {
  final Rxn<T> data = Rxn<T>();
  final Rxn<ApiException> error = Rxn<ApiException>();

  /// A refresh keeps the last data on screen; only a first load shows the skeleton.
  Future<void> load(Future<T> Function() fetch) async {
    error.value = null;
    try {
      data.value = await fetch();
    } on ApiException catch (failure) {
      error.value = failure;
    }
  }
}

/// Composes the lesson detail from the same routes the web reads, one
/// [AreaState] per route, and runs both retries with the web's error rules.
class LessonDetailController extends GetxController {
  LessonDetailController(this._api, this.lessonId);

  final LessonsApi _api;
  final String lessonId;

  final detail = AreaState<LessonDetail>();
  final analysis = AreaState<LessonAnalysisView>();
  final pronunciation = AreaState<LessonPronunciationView>();
  final transcript = AreaState<LessonTranscriptView>();
  final scenario = AreaState<LessonScenarioView>();
  final pipeline = AreaState<LessonPipelineView>();
  final recording = AreaState<LessonRecordingView>();

  final retrying = false.obs;
  final RxnString retryMessage = RxnString();

  bool get hasPending => detail.data.value?.summary.status.isPending ?? false;

  Future<void> loadAll() => Future.wait([
    detail.load(() => _api.detail(lessonId)),
    analysis.load(() => _api.analysis(lessonId)),
    pronunciation.load(() => _api.pronunciation(lessonId)),
    transcript.load(() => _api.transcript(lessonId)),
    scenario.load(() => _api.scenario(lessonId)),
    pipeline.load(() => _api.pipeline(lessonId)),
    recording.load(() => _api.recording(lessonId)),
  ]);

  Future<void> loadDetail() => detail.load(() => _api.detail(lessonId));
  Future<void> loadAnalysis() => analysis.load(() => _api.analysis(lessonId));
  Future<void> loadPronunciation() => pronunciation.load(() => _api.pronunciation(lessonId));
  Future<void> loadTranscript() => transcript.load(() => _api.transcript(lessonId));
  Future<void> loadScenario() => scenario.load(() => _api.scenario(lessonId));
  Future<void> loadStatus() => Future.wait([
    pipeline.load(() => _api.pipeline(lessonId)),
    recording.load(() => _api.recording(lessonId)),
  ]);

  /// `Retry` on a failed step. `PIPE001` (already retried, or no longer
  /// failed) refreshes silently; `PIPE002` goes to F07's recording retry;
  /// any other refusal (`REC001`, `REC002`, …) is shown under the step.
  Future<void> retry({bool recordingStep = false}) async {
    retrying.value = true;
    retryMessage.value = null;
    try {
      if (recordingStep) {
        await _api.retryRecording(lessonId);
      } else {
        await _api.retryPipeline(lessonId);
      }
    } on ApiException catch (failure) {
      if (failure.code == 'PIPE002') {
        try {
          await _api.retryRecording(lessonId);
        } on ApiException catch (recordingFailure) {
          retryMessage.value = recordingFailure.message;
        }
      } else if (failure.code != 'PIPE001') {
        retryMessage.value = failure.message;
      }
    } finally {
      retrying.value = false;
    }
    await loadAll();
  }
}
