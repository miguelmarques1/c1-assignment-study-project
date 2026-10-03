/// One pure table (spec §5), mirrored from `writing-draft-reconcile.ts`:
/// whether to use the server's copy, push unsynced local work, or surface a
/// conflict. Runs on open, and again on app resume after a fresh read.
library;

import 'writing_models.dart';

class LocalDraftForReconcile {
  const LocalDraftForReconcile({required this.text, required this.baseRevision});

  final String text;
  final int baseRevision;
}

class ServerDraftForReconcile {
  const ServerDraftForReconcile({required this.status, required this.text, required this.revision});

  final WritingTaskStatus status;
  final String text;
  final int revision;
}

enum DraftReconciliationKind { useServer, useLocal, conflict, submittedElsewhere }

class DraftReconciliation {
  const DraftReconciliation(this.kind);

  final DraftReconciliationKind kind;

  @override
  bool operator ==(Object other) => other is DraftReconciliation && other.kind == kind;

  @override
  int get hashCode => kind.hashCode;

  @override
  String toString() => 'DraftReconciliation($kind)';
}

const Set<WritingTaskStatus> _settledStatuses = {WritingTaskStatus.correcting, WritingTaskStatus.corrected};

/// `local` is null exactly when there is no stored copy for this task.
DraftReconciliation reconcileDraft(LocalDraftForReconcile? local, ServerDraftForReconcile server) {
  if (local == null) {
    return const DraftReconciliation(DraftReconciliationKind.useServer);
  }

  if (_settledStatuses.contains(server.status)) {
    return DraftReconciliation(
      local.text == server.text ? DraftReconciliationKind.useServer : DraftReconciliationKind.submittedElsewhere,
    );
  }

  if (local.baseRevision == server.revision) {
    return DraftReconciliation(local.text == server.text ? DraftReconciliationKind.useServer : DraftReconciliationKind.useLocal);
  }

  if (local.baseRevision < server.revision) {
    return DraftReconciliation(local.text == server.text ? DraftReconciliationKind.useServer : DraftReconciliationKind.conflict);
  }

  // local.baseRevision > server.revision: an anomaly (a clock or storage oddity) — treated as unsynced local
  // work rebased on the server's own revision, exactly as `use_local` handles a stale base on save.
  return const DraftReconciliation(DraftReconciliationKind.useLocal);
}
