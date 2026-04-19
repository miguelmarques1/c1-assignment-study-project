"use client";

import { useState } from "react";
import {
  reactivateUserAction,
  suspendUserAction,
} from "@/app/_lib/admin/user-actions";
import type { ActionResult } from "@/app/_lib/admin/errors";
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
  deleteAction?: (formData: FormData) => Promise<ActionResult>;
};

export function UserActionButtons({
  row,
  isSelf,
  deleteAction,
}: UserActionButtonsProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const toggleAction = row.isSuspended ? reactivateUserAction : suspendUserAction;
  const selfTitle = "You cannot suspend or delete your own admin account";

  return (
    <div className="flex items-center gap-2">
      <form action={toggleAction}>
        <input type="hidden" name="userId" value={row.id} />
        <input type="hidden" name="checksum" value={row.checksum} />
        <button
          type="submit"
          disabled={isSelf}
          title={isSelf ? selfTitle : undefined}
          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted-surface disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {row.isSuspended ? "Reactivate" : "Suspend"}
        </button>
      </form>
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
          onDeleted={() => setModalOpen(false)}
          deleteAction={deleteAction}
        />
      ) : null}
    </div>
  );
}
