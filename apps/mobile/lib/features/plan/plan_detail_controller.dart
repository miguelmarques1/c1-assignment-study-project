import 'package:get/get.dart';

import '../../core/network/api_exception.dart';
import 'plan_models.dart';
import 'plans_api.dart';

class PlanDetailController extends GetxController {
  PlanDetailController(this._api, this.planId);

  final PlansApi _api;
  final String planId;

  final plan = Rxn<StudyPlanView>();
  final error = Rxn<ApiException>();
  /// True once a load finds this id is the caller's active plan — its live
  /// view (status, retry) lives on the Plan tab, not this read-only screen.
  final isActivePlan = false.obs;

  Future<void> load() async {
    error.value = null;
    try {
      final current = await _api.current();
      if (current.plan?.id == planId) {
        isActivePlan.value = true;
        return;
      }
      plan.value = await _api.plan(planId);
    } on ApiException catch (failure) {
      error.value = failure;
    }
  }
}
