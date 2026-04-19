"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { renameVideo } from "@/app/_lib/videos/actions";
import type { ActionState } from "@/app/_lib/videos/actions";

const INITIAL_STATE: ActionState = { ok: false };
const MAX_TITLE = 200;

type Props = {
  videoId: string;
  initialTitle: string;
  isEditing: boolean;
  onClose: () => void;
  onRenamed?: (title: string) => void;
};

export function RenameField({
  videoId,
  initialTitle,
  isEditing,
  onClose,
  onRenamed,
}: Props) {
  const [state, formAction, pending] = useActionState(renameVideo, INITIAL_STATE);
  const [draft, setDraft] = useState(initialTitle);
  const [clientError, setClientError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      setDraft(initialTitle);
      setClientError(null);
      const id = window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [isEditing, initialTitle]);

  useEffect(() => {
    if (state.ok && state.item) {
      onRenamed?.(state.item.title);
      onClose();
    }
  }, [state, onRenamed, onClose]);

  const serverError = state.fieldErrors?.title?.[0] ?? state.message;

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  if (!isEditing) {
    return (
      <span
        className="block truncate text-sm font-medium text-foreground"
        title={initialTitle}
      >
        {initialTitle}
      </span>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        const trimmed = draft.trim();
        if (trimmed.length === 0) {
          event.preventDefault();
          setClientError("Title cannot be empty");
          return;
        }
        if (trimmed.length > MAX_TITLE) {
          event.preventDefault();
          setClientError(`Title must be at most ${MAX_TITLE} characters`);
          return;
        }
        setClientError(null);
      }}
      className="flex flex-col gap-1"
      data-testid="rename-form"
    >
      <input type="hidden" name="id" value={videoId} />
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          name="title"
          value={draft}
          maxLength={MAX_TITLE + 50}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Video title"
          aria-invalid={Boolean(clientError ?? serverError)}
          className="h-8 flex-1 rounded-md border border-border bg-white px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-white shadow-sm hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:bg-muted-surface"
        >
          Cancel
        </button>
      </div>
      {(clientError ?? serverError) && (
        <p role="alert" className="text-xs text-red-700">
          {clientError ?? serverError}
        </p>
      )}
    </form>
  );
}
