import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/session/session_store.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _FakeSecureStorage extends Mock implements FlutterSecureStorage {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late _FakeSecureStorage backing;
  late SessionStore store;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    backing = _FakeSecureStorage();
    store = SessionStore(backing);

    final secureValues = <String, String>{};
    when(() => backing.write(key: any(named: 'key'), value: any(named: 'value')))
        .thenAnswer((invocation) async {
      secureValues[invocation.namedArguments[#key] as String] =
          invocation.namedArguments[#value] as String;
    });
    when(() => backing.read(key: any(named: 'key'))).thenAnswer(
      (invocation) async => secureValues[invocation.namedArguments[#key] as String],
    );
    when(() => backing.delete(key: any(named: 'key'))).thenAnswer((invocation) async {
      secureValues.remove(invocation.namedArguments[#key] as String);
    });
  });

  group('SessionStore', () {
    test('the_token_is_absent_from_shared_preferences', () async {
      await store.save(token: 'secret-token', expiresAt: DateTime(2026));

      final prefs = await SharedPreferences.getInstance();
      final allValues = prefs.getKeys().map(prefs.get);

      expect(allValues.contains('secret-token'), isFalse);
    });

    test('clear_removes_both_keys', () async {
      await store.save(token: 'secret-token', expiresAt: DateTime(2026));

      await store.clear();

      expect(await store.readToken(), isNull);
      expect(await store.readExpiresAt(), isNull);
    });
  });
}
