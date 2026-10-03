import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/writing/writing_draft_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const taskId = '22222222-2222-4222-8222-222222222222';

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('WritingDraftStore', () {
    test('round_trips_a_draft', () async {
      final store = WritingDraftStore();
      final draft = LocalWritingDraft(text: 'Hello there', baseRevision: 2, editedAt: DateTime.parse('2026-10-02T08:00:00.000Z'), pendingActiveSeconds: 12);

      await store.write(taskId, draft);
      final read = await store.read(taskId);

      expect(read, isNotNull);
      expect(read!.text, 'Hello there');
      expect(read.baseRevision, 2);
      expect(read.pendingActiveSeconds, 12);
    });

    test('reads_null_when_nothing_is_stored', () async {
      final store = WritingDraftStore();
      expect(await store.read(taskId), isNull);
    });

    test('clear_removes_the_stored_draft', () async {
      final store = WritingDraftStore();
      await store.write(taskId, LocalWritingDraft(text: 'text', baseRevision: 1, editedAt: DateTime.now(), pendingActiveSeconds: 0));

      await store.clear(taskId);

      expect(await store.read(taskId), isNull);
    });

    test('a_read_tolerates_a_platform_exception', () async {
      final store = WritingDraftStore(prefsProvider: () async => throw Exception('platform channel unavailable'));
      expect(await store.read(taskId), isNull);
    });

    test('a_write_tolerates_a_platform_exception', () async {
      final store = WritingDraftStore(prefsProvider: () async => throw Exception('platform channel unavailable'));
      await expectLater(
        store.write(taskId, LocalWritingDraft(text: 'text', baseRevision: 1, editedAt: DateTime.now(), pendingActiveSeconds: 0)),
        completes,
      );
    });

    test('a_clear_tolerates_a_platform_exception', () async {
      final store = WritingDraftStore(prefsProvider: () async => throw Exception('platform channel unavailable'));
      await expectLater(store.clear(taskId), completes);
    });
  });
}
