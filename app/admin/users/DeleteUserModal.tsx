"use client";

import { useEffect, useRef, useState } from "react";
import { deleteUser } from "@/app/_lib/admin/user-actions";
import type { ActionResult } from "@/app/_lib/admin/errors";

export const DELETE_LOCKOUT_MS = 1000;

export type DeleteUserModalProps = {
  user: { id: string; email: string; name: string; checksum: string };
  onClose: () => void;
  onDeleted: () => void;
  deleteAction?: (formData: FormData) => Promise<ActionResult>;
};

export function DeleteUserModal({
  user,
  onClose,
  onDeleted,
  deleteAction,
}: DeleteUserModalProps) {
  const [typed, setTyped] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedOut, setLockedOut] = useState(true);
  const openedAt = useRef<number>(Date.now());
  const action = deleteAction ?? deleteUser;

  useEffect(() => {
    const remaining = DELETE_LOCKOUT_MS - (Date.now() - openedAt.current);
    if (remaining <= 0) {
      setLockedOut(false);
      return;
    }
    const timer = setTimeout(() => setLockedOut(false), remaining);
    return () => clearTimeout(timer);
  }, []);

  const emailMatches = typed.trim().toLowerCase() === user.email.toLowerCase();
  const disabled = submitting || lockedOut || !emailMatches;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    setSubmitting(true);
    setError(null);
    const formData = new FormData();
    formData.set("userId", user.id);
    formData.set("checksum", user.checksum);
    formData.set("emailConfirmation", typed);
    try {
      const result = await action(formData);
      if (result.ok) {
        onDeleted();
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-user-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg">
        <h2 id="delete-user-title" className="text-lg font-semibold text-foreground">
          Delete user
        </h2>
        <p className="mt-2 text-sm text-muted">
          This will permanently delete <strong>{user.name}</strong> and all of their
          videos, sessions, and stored data. This cannot be undone.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <label htmlFor="delete-user-email" className="text-sm font-medium text-foreground">
            Type <span className="font-mono">{user.email}</span> to confirm
          </label>
          <input
            id="delete-user-email"
            type="text"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            autoFocus
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted-surface"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={disabled}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Deleting…" : "Delete user"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
