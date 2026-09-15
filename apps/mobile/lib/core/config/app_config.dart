import 'package:get/get.dart';
import 'package:shared_preferences/shared_preferences.dart';

const String kApiBaseUrlKey = 'eq.api.baseUrl';

/// The Android emulator's alias for the host machine — the only value that
/// works without editing, so a developer never hits a blank field first run.
const String kDefaultApiBaseUrl = 'http://10.0.2.2:3001';

/// Thrown by [AppConfig.setBaseUrl] when the given value isn't a usable URL.
class InvalidBaseUrlException implements Exception {
  const InvalidBaseUrlException(this.value);

  final String value;

  @override
  String toString() => 'Invalid API base URL: $value';
}

bool isValidBaseUrl(String value) {
  final uri = Uri.tryParse(value);
  return uri != null &&
      (uri.scheme == 'http' || uri.scheme == 'https') &&
      uri.host.isNotEmpty;
}

/// The runtime-editable API base URL, persisted in ordinary preferences (it
/// isn't a secret) and exposed reactively so the HTTP client re-targets
/// without an app restart.
class AppConfig {
  AppConfig(this._prefs)
      : baseUrl = (_prefs.getString(kApiBaseUrlKey) ?? kDefaultApiBaseUrl).obs;

  final SharedPreferences _prefs;
  final Rx<String> baseUrl;

  static Future<AppConfig> create() async {
    return AppConfig(await SharedPreferences.getInstance());
  }

  Future<void> setBaseUrl(String value) async {
    final trimmed = value.trim();
    if (!isValidBaseUrl(trimmed)) {
      throw InvalidBaseUrlException(trimmed);
    }
    await _prefs.setString(kApiBaseUrlKey, trimmed);
    baseUrl.value = trimmed;
  }
}
