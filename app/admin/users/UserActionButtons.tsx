"use client";

import { useState, useTransition } from "react";
import {
  reactivateUser,
  suspendUser,
  type ActionResult,
} from "@/app/_lib/admin/user-actions";
import { DeleteUserModal } from "@/app/admin/users/DeleteUserModal";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  isSuspended: boolean;
  checksum: string;
};

export type UserActionButtonsProps = {
  row: UserRow;
  isSelf: boolean;
  onError: (message: string) => void;
  onSuccess?: () => void;
  suspendAction?: (formData: FormData) => Promise<ActionResult>;
  reactivateAction?: (formData: FormData) => Promise<ActionResult>;
  deleteAction?: (formData: FormData) => Promise<ActionResult>;
};

export function UserActionButtons({
  row,
  isSelf,
  onError,
  onSuccess,
  suspendAction,
  reactivateAction,
  deleteAction,
}: UserActionButtonsProps) {
  const [isPending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);

  const suspend = suspendAction ?? suspendUser;
  const reactivate = reactivateAction ?? reactivateUser;

  function callToggle() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("userId", row.id);
      formData.set("checksum", row.checksum);
      const action = row.isSuspended ? reactivate : suspend;
      try {
        const result = await action(formData);
        if (result.ok) {
          onSuccess?.();
        } else {
          onError(result.error);
        }
      } catch (err) {
        onError(err instanceof Error ? err.message : "Unexpected error");
      }
    });
  }

  const selfTitle = "You cannot suspend or delete your own admin account";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={callToggle}
        disabled={isSelf || isPending}
        title={isSelf ? selfTitle : undefined}
        className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted-surface disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {row.isSuspended ? "Reactivate" : "Suspend"}
      </button>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        disabled={isSelf}
        title={isSelf ? selfTitle : undefined}
        className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Delete
      </button>
      {modalOpen ? (
        <DeleteUserModal
          user={{
            id: row.id,
            email: row.email,
            name: row.name,
            checksum: row.checksum,
          }}
          onClose={() => setModalOpen(false)}
          onDeleted={() => {
            setModalOpen(false);
            onSuccess?.();
          }}
          deleteAction={deleteAction}
        />
      ) : null}
    </div>
  );
}
