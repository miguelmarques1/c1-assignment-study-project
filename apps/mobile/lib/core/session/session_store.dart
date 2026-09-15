import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const String kSessionTokenKey = 'eq.session.token';
const String kSessionExpiresAtKey = 'eq.session.expiresAt';

/// Keystore/Keychain-only persistence for the session token and its expiry.
/// Never touches `SharedPreferences` — that boundary is what F03's acceptance
/// criterion asserts.
class SessionStore {
  SessionStore([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  Future<void> save({required String token, required DateTime expiresAt}) async {
    await _storage.write(key: kSessionTokenKey, value: token);
    await _storage.write(
      key: kSessionExpiresAtKey,
      value: expiresAt.toIso8601String(),
    );
  }

  Future<String?> readToken() => _storage.read(key: kSessionTokenKey);

  Future<DateTime?> readExpiresAt() async {
    final raw = await _storage.read(key: kSessionExpiresAtKey);
    return raw == null ? null : DateTime.parse(raw);
  }

  Future<void> clear() async {
    await _storage.delete(key: kSessionTokenKey);
    await _storage.delete(key: kSessionExpiresAtKey);
  }
}
