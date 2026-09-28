import 'package:get/get.dart';

import '../../core/network/api_exception.dart';
import 'plan_models.dart';
import 'plans_api.dart';

class PlanHistoryController extends GetxController {
  PlanHistoryController(this._api);

  final PlansApi _api;

  final plans = <PlanHistoryItem>[].obs;
  final loaded = false.obs;
  final error = Rxn<ApiException>();

  Future<void> load() async {
    error.value = null;
    try {
      final view = await _api.history();
      plans.assignAll(view.plans);
      loaded.value = true;
    } on ApiException catch (failure) {
      error.value = failure;
    }
  }
}
