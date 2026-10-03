/**
 * The learner's own unsent draft, kept on this device only (spec A7). Never
 * a cache for browsing — just the text a closed tab or a dead battery must
 * not lose. Keyed by task id, not activity id, so a carried-over activity
 * still finds its local copy. Every access is wrapped in try/catch: a
 * private window, cleared site data or a full quota must never break the
 * editor, only the "not synced" indicator.
 */
export interface LocalWritingDraft {
  text: string;
  baseRevision: number;
  editedAt: string;
  pendingActiveSeconds: number;
}

function storageKey(taskId: string): string {
  return `eq.writing.draft.${taskId}`;
}

export function readLocalDraft(taskId: string): LocalWritingDraft | null {
  try {
    const raw = window.localStorage.getItem(storageKey(taskId));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as LocalWritingDraft;
  } catch {
    return null;
  }
}

export function writeLocalDraft(taskId: string, value: LocalWritingDraft): void {
  try {
    window.localStorage.setItem(storageKey(taskId), JSON.stringify(value));
  } catch {
    // Best-effort only — the server copy is what every other device and the next visit resume from.
  }
}

export function clearLocalDraft(taskId: string): void {
  try {
    window.localStorage.removeItem(storageKey(taskId));
  } catch {
    // Nothing to clean up if storage was never reachable.
  }
}
