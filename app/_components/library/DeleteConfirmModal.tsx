"use client";

import {
  useActionState,
  useEffect,
  useState,
  type KeyboardEvent,
} from "react";
import { deleteVideo } from "@/app/_lib/videos/actions";
import type { ActionState } from "@/app/_lib/videos/actions";

const INITIAL_STATE: ActionState = { ok: false };
export const DELETE_LOCK_MS = 1000;

type Props = {
  open: boolean;
  videoId: string;
  videoTitle: string;
  onClose: () => void;
  onDeleted?: () => void;
};

export function DeleteConfirmModal({
  open,
  videoId,
  videoTitle,
  onClose,
  onDeleted,
}: Props) {
  const [state, formAction, pending] = useActionState(deleteVideo, INITIAL_STATE);
  const [unlocked, setUnlocked] = useState(false);
  const [alreadyDeleted, setAlreadyDeleted] = useState(false);

  useEffect(() => {
    if (open) {
      setUnlocked(false);
      setAlreadyDeleted(false);
      const id = window.setTimeout(() => setUnlocked(true), DELETE_LOCK_MS);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (state.ok) {
      onDeleted?.();
      onClose();
      return;
    }
    if (state.code === "LIB_ALREADY_DELETED") {
      setAlreadyDeleted(true);
      const id = window.setTimeout(() => {
        onDeleted?.();
        onClose();
      }, 1200);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [state, open, onDeleted, onClose]);

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={`Confirm deletion of ${videoTitle}`}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="mb-2 text-base font-semibold text-foreground">
          {`Delete '${videoTitle}'?`}
        </h2>
        <p className="mb-4 text-sm text-muted">This cannot be undone.</p>
        {alreadyDeleted && (
          <p role="alert" className="mb-3 text-sm text-red-700">
            This video has already been deleted
          </p>
        )}
        {state.message && !state.ok && state.code !== "LIB_ALREADY_DELETED" && (
          <p role="alert" className="mb-3 text-sm text-red-700">
            {state.message}
          </p>
        )}
        <form action={formAction} className="flex justify-end gap-2">
          <input type="hidden" name="id" value={videoId} />
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:bg-muted-surface"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!unlocked || pending || alreadyDeleted}
            aria-disabled={!unlocked || pending || alreadyDeleted}
            data-testid="delete-confirm-button"
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Delete"}
          </button>
        </form>
      </div>
    </div>
  );
}
