import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/writing/draft_reconcile.dart';
import 'package:mobile/features/writing/writing_models.dart';

void main() {
  group('reconcileDraft', () {
    test('no_local_copy_uses_the_server', () {
      final result = reconcileDraft(null, const ServerDraftForReconcile(status: WritingTaskStatus.draft, text: 'server text', revision: 3));
      expect(result.kind, DraftReconciliationKind.useServer);
    });

    test('same_revision_same_text_uses_the_server', () {
      const server = ServerDraftForReconcile(status: WritingTaskStatus.draft, text: 'same text', revision: 3);
      final result = reconcileDraft(const LocalDraftForReconcile(text: 'same text', baseRevision: 3), server);
      expect(result.kind, DraftReconciliationKind.useServer);
    });

    test('same_revision_different_text_pushes_local_work', () {
      const server = ServerDraftForReconcile(status: WritingTaskStatus.draft, text: 'server text', revision: 3);
      final result = reconcileDraft(const LocalDraftForReconcile(text: 'local text', baseRevision: 3), server);
      expect(result.kind, DraftReconciliationKind.useLocal);
    });

    test('older_revision_same_text_adopts_the_server', () {
      const server = ServerDraftForReconcile(status: WritingTaskStatus.draft, text: 'same text', revision: 5);
      final result = reconcileDraft(const LocalDraftForReconcile(text: 'same text', baseRevision: 3), server);
      expect(result.kind, DraftReconciliationKind.useServer);
    });

    test('older_revision_different_text_is_a_conflict', () {
      const server = ServerDraftForReconcile(status: WritingTaskStatus.draft, text: 'server text', revision: 5);
      final result = reconcileDraft(const LocalDraftForReconcile(text: 'local text', baseRevision: 3), server);
      expect(result.kind, DraftReconciliationKind.conflict);
    });

    test('submitted_elsewhere_with_different_local_text_is_surfaced', () {
      const server = ServerDraftForReconcile(status: WritingTaskStatus.corrected, text: 'server text', revision: 9);
      final result = reconcileDraft(const LocalDraftForReconcile(text: 'local text', baseRevision: 3), server);
      expect(result.kind, DraftReconciliationKind.submittedElsewhere);

      const correcting = ServerDraftForReconcile(status: WritingTaskStatus.correcting, text: 'server text', revision: 9);
      final correctingResult = reconcileDraft(const LocalDraftForReconcile(text: 'local text', baseRevision: 3), correcting);
      expect(correctingResult.kind, DraftReconciliationKind.submittedElsewhere);
    });

    test('submitted_elsewhere_with_equal_text_clears_the_local_copy', () {
      const server = ServerDraftForReconcile(status: WritingTaskStatus.corrected, text: 'same text', revision: 9);
      final result = reconcileDraft(const LocalDraftForReconcile(text: 'same text', baseRevision: 3), server);
      expect(result.kind, DraftReconciliationKind.useServer);
    });

    test('newer_local_revision_is_rebased_as_local_work', () {
      const server = ServerDraftForReconcile(status: WritingTaskStatus.draft, text: 'server text', revision: 3);
      final result = reconcileDraft(const LocalDraftForReconcile(text: 'local text', baseRevision: 5), server);
      expect(result.kind, DraftReconciliationKind.useLocal);
    });
  });
}
