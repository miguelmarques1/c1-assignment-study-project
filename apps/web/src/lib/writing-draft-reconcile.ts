import type { WritingTaskStatus } from '@english-quest/shared';

export interface LocalDraftForReconcile {
  text: string;
  baseRevision: number;
}

export interface ServerDraftForReconcile {
  status: WritingTaskStatus;
  text: string;
  revision: number;
}

export type DraftReconciliation =
  | { kind: 'use_server' }
  | { kind: 'use_local' }
  | { kind: 'conflict' }
  | { kind: 'submitted_elsewhere' };

const SETTLED_STATUSES = new Set<WritingTaskStatus>(['correcting', 'corrected']);

/**
 * One pure table (spec §5), mirrored in `draft_reconcile.dart`: whether to
 * use the server's copy, push unsynced local work, or surface a conflict.
 * Runs on open, and again on window focus or app resume after a fresh read.
 * `local` is null exactly when there is no stored copy for this task.
 */
export function reconcileDraft(local: LocalDraftForReconcile | null, server: ServerDraftForReconcile): DraftReconciliation {
  if (!local) {
    return { kind: 'use_server' };
  }

  if (SETTLED_STATUSES.has(server.status)) {
    return local.text === server.text ? { kind: 'use_server' } : { kind: 'submitted_elsewhere' };
  }

  if (local.baseRevision === server.revision) {
    return local.text === server.text ? { kind: 'use_server' } : { kind: 'use_local' };
  }

  if (local.baseRevision < server.revision) {
    return local.text === server.text ? { kind: 'use_server' } : { kind: 'conflict' };
  }

  // local.baseRevision > server.revision: an anomaly (a clock or storage oddity) — treated as unsynced local
  // work rebased on the server's own revision, exactly as `use_local` handles a stale base on save.
  return { kind: 'use_local' };
}
