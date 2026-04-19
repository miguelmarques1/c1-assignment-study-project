"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { editVideoDescription } from "@/app/_lib/videos/actions";
import type { ActionState } from "@/app/_lib/videos/actions";

const INITIAL_STATE: ActionState = { ok: false };
const MAX_DESCRIPTION = 2000;

type Props = {
  open: boolean;
  videoId: string;
  videoTitle: string;
  initialDescription: string;
  onClose: () => void;
  onSaved?: (description: string) => void;
};

export function DescriptionModal({
  open,
  videoId,
  videoTitle,
  initialDescription,
  onClose,
  onSaved,
}: Props) {
  const [state, formAction, pending] = useActionState(
    editVideoDescription,
    INITIAL_STATE,
  );
  const [draft, setDraft] = useState(initialDescription);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(initialDescription);
      const id = window.setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open, initialDescription]);

  useEffect(() => {
    if (state.ok && state.item) {
      onSaved?.(state.item.description);
      onClose();
    }
  }, [state, onSaved, onClose]);

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  const remaining = MAX_DESCRIPTION - draft.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Edit description for ${videoTitle}`}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg rounded-lg border border-border bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mb-4 flex flex-col gap-1">
          <h2 className="text-base font-semibold text-foreground">Edit description</h2>
          <p className="truncate text-xs text-muted" title={videoTitle}>
            {videoTitle}
          </p>
        </header>
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={videoId} />
          <textarea
            ref={textareaRef}
            name="description"
            value={draft}
            maxLength={MAX_DESCRIPTION}
            rows={6}
            onChange={(event) => setDraft(event.target.value)}
            className="w-full resize-y rounded-md border border-border bg-white p-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            placeholder="Write a description for this video"
          />
          <div className="flex items-center justify-between text-xs text-muted">
            <span aria-live="polite" data-testid="description-counter">
              {draft.length} / {MAX_DESCRIPTION}
            </span>
            {remaining < 0 && (
              <span role="alert" className="text-red-700">
                Description must be at most {MAX_DESCRIPTION} characters
              </span>
            )}
          </div>
          {state.message && !state.ok && (
            <p role="alert" className="text-xs text-red-700">
              {state.message}
            </p>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:bg-muted-surface"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-accent-hover disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
