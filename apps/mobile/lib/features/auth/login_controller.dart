import 'dart:async';

import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../../core/network/api_exception.dart';
import '../../core/session/session_controller.dart';

/// Mirrors the web login form's behaviour: validate locally before the
/// request, surface the API's own message on failure, and turn AUTH002's
/// `retryAfterSeconds` into a countdown the button respects.
class LoginController extends GetxController {
  LoginController(this._session);

  final SessionController _session;

  final RxBool submitting = false.obs;
  final RxnString error = RxnString();
  final RxInt lockoutSecondsLeft = 0.obs;
  Timer? _lockoutTimer;

  bool get isLocked => lockoutSecondsLeft.value > 0;

  Future<bool> submit(String email, String password) async {
    if (isLocked) return false;

    final trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail.contains('@') || trimmedEmail.isEmpty) {
      error.value = 'Enter a valid email address.';
      return false;
    }
    if (password.isEmpty) {
      error.value = 'Enter your password.';
      return false;
    }

    submitting.value = true;
    error.value = null;
    try {
      await _session.login(trimmedEmail, password);
      return true;
    } on DioException catch (dioError) {
      final apiError = ApiException.fromDioException(dioError);
      error.value = apiError.message;

      final retryAfter = apiError.details?['retryAfterSeconds'];
      if (apiError.code == 'AUTH002' && retryAfter is int) {
        _startLockout(retryAfter);
      }
      return false;
    } finally {
      submitting.value = false;
    }
  }

  void _startLockout(int seconds) {
    lockoutSecondsLeft.value = seconds;
    _lockoutTimer?.cancel();
    _lockoutTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (lockoutSecondsLeft.value <= 1) {
        lockoutSecondsLeft.value = 0;
        error.value = null;
        _lockoutTimer?.cancel();
      } else {
        lockoutSecondsLeft.value--;
      }
    });
  }

  @override
  void onClose() {
    _lockoutTimer?.cancel();
    super.onClose();
  }
}
