import 'package:get/get.dart';

import '../../core/network/api_exception.dart';
import 'plan_models.dart';
import 'plans_api.dart';

/// The caller's current plan: loading, error and ready states, and the
/// retry of a failed build. Today and Plan each own one instance (this app
/// constructs its API clients per page, as `LessonListController` does,
/// rather than sharing a single bound instance across routes).
class CurrentPlanController extends GetxController {
  CurrentPlanController(this._api);

  final PlansApi _api;

  final current = Rxn<CurrentPlanView>();
  final loaded = false.obs;
  final error = Rxn<ApiException>();
  final retrying = false.obs;

  bool get isPreparing => current.value?.preparing != null;

  /// A refresh keeps the last view on screen; only a first load shows the skeleton.
  Future<void> load() async {
    error.value = null;
    try {
      current.value = await _api.current();
      loaded.value = true;
    } on ApiException catch (failure) {
      error.value = failure;
    }
  }

  Future<void> retry() async {
    retrying.value = true;
    try {
      current.value = await _api.retry();
    } on ApiException {
      // The banner already shows the failure; a refused retry just leaves it as is.
    } finally {
      retrying.value = false;
    }
  }
}
