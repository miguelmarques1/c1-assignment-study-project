import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../profile/profile_models.dart';
import 'progress_chart_model.dart';
import 'progress_models.dart';

/// The progress screen state: the caller own view from `GET /progress`, the
/// selected range and visible lines, and a ledger record detail on demand.
/// Every route is the caller own; nothing here takes a user id.
class ProgressController extends GetxController {
  ProgressController(this._dio);

  final Dio _dio;

  final Rx<ProgressDashboardView?> view = Rx<ProgressDashboardView?>(null);
  final RxnString loadError = RxnString();
  final Rx<ProgressRange> range = ProgressRange.all.obs;
  final Rx<List<ProfileCompetency>> visible = Rx<List<ProfileCompetency>>(showAll());
  final Rxn<ChartMoment> selected = Rxn<ChartMoment>();
  final RxBool listOpen = false.obs;

  Future<void> load() async {
    loadError.value = null;
    try {
      final response = await _dio.get<Map<String, dynamic>>('/progress');
      view.value = ProgressDashboardView.fromJson(response.data!['data'] as Map<String, dynamic>);
    } on DioException {
      loadError.value = 'Your progress could not be loaded.';
    }
  }

  void selectRange(ProgressRange next) {
    range.value = next;
    selected.value = null;
  }

  void toggle(ProfileCompetency competency) {
    visible.value = toggleCompetency(visible.value, competency);
    selected.value = null;
  }

  void revealAll() {
    visible.value = showAll();
    selected.value = null;
  }

  /// One record examples and sources. Throws `DioException` for the sheet to show its own error.
  Future<LedgerEntryDetailView> loadEntry(String entryId) async {
    final response = await _dio.get<Map<String, dynamic>>('/profile/ledger/${Uri.encodeComponent(entryId)}');
    return LedgerEntryDetailView.fromJson(response.data!['data'] as Map<String, dynamic>);
  }
}
