'use client';

import {
  WRITING_ACTIVE_SECONDS_MAX_DELTA,
  WRITING_LOCAL_SAVE_INTERVAL_MS,
  WRITING_SERVER_SAVE_INTERVAL_MS,
  type WritingActivityView,
  type WritingTaskStatus,
} from '@english-quest/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiRequestError } from '@/lib/api-client';
import { getWriting, saveWritingDraft } from '@/lib/writing';
import { clearLocalDraft, readLocalDraft, writeLocalDraft } from '@/lib/writing-draft-store';
import { reconcileDraft } from '@/lib/writing-draft-reconcile';

export type WritingSaveState = 'saved' | 'saving' | 'local_only' | 'conflict';

export interface WritingDraftConflict {
  text: string;
  revision: number;
  savedAt: string | null;
}

/** `saved`: the given revision is on the server. `conflict`: a submit must not proceed — the banner now owns the screen. `local_only`: proceed with the caller's best-known revision. */
export type WritingFlushResult = { status: 'saved'; text: string; revision: number } | { status: 'conflict' } | { status: 'local_only' };

export interface UseWritingDraftOptions {
  activityId: string;
  taskId: string;
  initial: { text: string; revision: number; savedAt: string | null; status: WritingTaskStatus };
  /** A reconcile on focus found the server past `draft`-like — the screen switches to the checking or result view. */
  onServerSettled: (view: WritingActivityView) => void;
}

export interface UseWritingDraftResult {
  text: string;
  setText: (value: string) => void;
  revision: number;
  saveState: WritingSaveState;
  savedAt: string | null;
  conflict: WritingDraftConflict | null;
  localVersionText: string | null;
  continueWithLatest: () => void;
  flush: (options?: { keepalive?: boolean }) => Promise<WritingFlushResult>;
}

const EDITABLE_STATUSES = new Set<WritingTaskStatus>(['draft', 'uncorrected', 'correction_failed']);

function clampActiveSeconds(seconds: number): number {
  return Math.max(0, Math.min(WRITING_ACTIVE_SECONDS_MAX_DELTA, Math.round(seconds)));
}

/**
 * Local autosave every 5 seconds, server autosave every 30 (spec A8), a
 * flush on hide/pagehide, and reconciliation on open and window focus
 * (§5's table). The server copy is always authoritative: a conflict is
 * surfaced, never resolved on the caller's behalf (A5).
 */
export function useWritingDraft(options: UseWritingDraftOptions): UseWritingDraftResult {
  const { activityId, taskId, initial, onServerSettled } = options;

  const [text, setTextState] = useState(initial.text);
  const [revision, setRevision] = useState(initial.revision);
  const [savedAt, setSavedAt] = useState(initial.savedAt);
  const [saveState, setSaveState] = useState<WritingSaveState>('saved');
  const [conflict, setConflict] = useState<WritingDraftConflict | null>(null);
  const [localVersionText, setLocalVersionText] = useState<string | null>(null);

  const textRef = useRef(text);
  textRef.current = text;
  const revisionRef = useRef(revision);
  revisionRef.current = revision;
  const conflictRef = useRef(conflict);
  conflictRef.current = conflict;

  const lastLocalSavedTextRef = useRef(initial.text);
  const lastServerSavedTextRef = useRef(initial.text);
  const activeSecondsRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const savingRef = useRef(false);

  const setText = useCallback((value: string) => setTextState(value), []);

  const accumulateVisibleSeconds = useCallback((): void => {
    const now = Date.now();
    if (lastTickRef.current !== null && typeof document !== 'undefined' && document.visibilityState === 'visible') {
      activeSecondsRef.current += (now - lastTickRef.current) / 1000;
    }
    lastTickRef.current = now;
  }, []);

  const flush = useCallback(
    async (flushOptions: { keepalive?: boolean } = {}): Promise<WritingFlushResult> => {
      if (conflictRef.current) {
        return { status: 'conflict' };
      }
      if (savingRef.current) {
        return { status: 'local_only' };
      }
      const currentText = textRef.current;
      if (currentText === lastServerSavedTextRef.current) {
        return { status: 'saved', text: currentText, revision: revisionRef.current };
      }
      accumulateVisibleSeconds();
      const delta = clampActiveSeconds(activeSecondsRef.current);
      savingRef.current = true;
      setSaveState('saving');
      try {
        const result = await saveWritingDraft(
          activityId,
          { text: currentText, baseRevision: revisionRef.current, activeSecondsDelta: delta },
          { keepalive: flushOptions.keepalive },
        );
        activeSecondsRef.current = 0;
        lastServerSavedTextRef.current = currentText;
        lastLocalSavedTextRef.current = currentText;
        revisionRef.current = result.revision;
        setRevision(result.revision);
        setSavedAt(result.savedAt);
        setSaveState('saved');
        clearLocalDraft(taskId);
        return { status: 'saved', text: currentText, revision: result.revision };
      } catch (error) {
        if (error instanceof ApiRequestError && error.code === 'WRIT004') {
          const details = error.details as { draft: WritingDraftConflict } | undefined;
          if (details) {
            setConflict(details.draft);
            setLocalVersionText(currentText);
            // The editor goes read-only and shows the server's copy (A6); the local edit survives in `localVersionText`.
            setTextState(details.draft.text);
            textRef.current = details.draft.text;
          }
          setSaveState('conflict');
          return { status: 'conflict' };
        }
        writeLocalDraft(taskId, {
          text: currentText,
          baseRevision: revisionRef.current,
          editedAt: new Date().toISOString(),
          pendingActiveSeconds: activeSecondsRef.current,
        });
        setSaveState('local_only');
        return { status: 'local_only' };
      } finally {
        savingRef.current = false;
      }
    },
    [accumulateVisibleSeconds, activityId, taskId],
  );
  const flushRef = useRef(flush);
  flushRef.current = flush;

  // Reconcile once on mount against any local copy from a closed tab or a dead battery (spec §5's table).
  useEffect(() => {
    const local = readLocalDraft(taskId);
    const result = reconcileDraft(local, { status: initial.status, text: initial.text, revision: initial.revision });
    if (result.kind === 'use_local' && local) {
      setTextState(local.text);
      textRef.current = local.text;
      lastLocalSavedTextRef.current = local.text;
      activeSecondsRef.current = local.pendingActiveSeconds;
      // lastServerSavedTextRef stays at the server's text, so this immediate flush pushes the unsynced work.
      void flushRef.current();
    } else if (result.kind === 'conflict' && local) {
      setConflict({ text: initial.text, revision: initial.revision, savedAt: initial.savedAt });
      setLocalVersionText(local.text);
    } else {
      clearLocalDraft(taskId);
    }
    // Only the very first mount reconciles against a stored copy; taskId never changes under one screen instance,
    // and `initial`/`flushRef` are intentionally excluded — they are the task's starting values and a stable ref.
  }, [taskId]);

  useEffect(() => {
    lastTickRef.current = Date.now();
    const timer = setInterval(accumulateVisibleSeconds, 1000);
    return () => clearInterval(timer);
  }, [accumulateVisibleSeconds]);

  // Local autosave every 5 seconds while changed.
  useEffect(() => {
    const timer = setInterval(() => {
      if (conflictRef.current || textRef.current === lastLocalSavedTextRef.current) {
        return;
      }
      writeLocalDraft(taskId, {
        text: textRef.current,
        baseRevision: revisionRef.current,
        editedAt: new Date().toISOString(),
        pendingActiveSeconds: activeSecondsRef.current,
      });
      lastLocalSavedTextRef.current = textRef.current;
    }, WRITING_LOCAL_SAVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [taskId]);

  // Server autosave every 30 seconds while changed.
  useEffect(() => {
    const timer = setInterval(() => {
      if (conflictRef.current || textRef.current === lastServerSavedTextRef.current) {
        return;
      }
      void flushRef.current();
    }, WRITING_SERVER_SAVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  // Flush locally and to the server when the page is hidden, so a closed tab never loses more than a few seconds.
  useEffect(() => {
    function flushForHide(): void {
      if (textRef.current !== lastLocalSavedTextRef.current) {
        writeLocalDraft(taskId, {
          text: textRef.current,
          baseRevision: revisionRef.current,
          editedAt: new Date().toISOString(),
          pendingActiveSeconds: activeSecondsRef.current,
        });
        lastLocalSavedTextRef.current = textRef.current;
      }
      void flushRef.current({ keepalive: true });
    }
    function onVisibilityChange(): void {
      if (document.visibilityState === 'hidden') {
        flushForHide();
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', flushForHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', flushForHide);
    };
  }, [taskId]);

  // Reconcile on window focus, after a fresh read.
  useEffect(() => {
    function onFocus(): void {
      void (async () => {
        try {
          const fresh = await getWriting(activityId);
          if (!EDITABLE_STATUSES.has(fresh.status)) {
            onServerSettled(fresh);
            return;
          }
          // With nothing unsaved, there is no local work to protect — always adopt the fresh copy, even if its
          // revision would otherwise look like a conflict against a stale `baseRevision` this device never used.
          const hasUnsavedEdits = textRef.current !== lastServerSavedTextRef.current;
          const result: ReturnType<typeof reconcileDraft> = hasUnsavedEdits
            ? reconcileDraft(
                { text: textRef.current, baseRevision: revisionRef.current },
                { status: fresh.status, text: fresh.draft.text, revision: fresh.draft.revision },
              )
            : { kind: 'use_server' };
          if (result.kind === 'use_server') {
            setTextState(fresh.draft.text);
            textRef.current = fresh.draft.text;
            revisionRef.current = fresh.draft.revision;
            setRevision(fresh.draft.revision);
            setSavedAt(fresh.draft.savedAt);
            lastServerSavedTextRef.current = fresh.draft.text;
            lastLocalSavedTextRef.current = fresh.draft.text;
            clearLocalDraft(taskId);
          } else if (result.kind === 'conflict') {
            const localText = textRef.current;
            setConflict({ text: fresh.draft.text, revision: fresh.draft.revision, savedAt: fresh.draft.savedAt });
            setLocalVersionText(localText);
            // The editor goes read-only and shows the server's copy (A6); the local edit survives in `localVersionText`.
            setTextState(fresh.draft.text);
            textRef.current = fresh.draft.text;
          }
          // use_local: nothing to do here — the next autosave tick pushes it.
        } catch {
          // Transient; the next autosave tick or focus event retries.
        }
      })();
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [activityId, taskId, onServerSettled]);

  const continueWithLatest = useCallback(() => {
    if (!conflict) {
      return;
    }
    setTextState(conflict.text);
    textRef.current = conflict.text;
    revisionRef.current = conflict.revision;
    setRevision(conflict.revision);
    setSavedAt(conflict.savedAt);
    lastServerSavedTextRef.current = conflict.text;
    lastLocalSavedTextRef.current = conflict.text;
    activeSecondsRef.current = 0;
    setConflict(null);
    setLocalVersionText(null);
    setSaveState('saved');
    clearLocalDraft(taskId);
  }, [conflict, taskId]);

  return { text, setText, revision, saveState, savedAt, conflict, localVersionText, continueWithLatest, flush };
}
