export type ActionError =
  | "ADMIN_NOT_FOUND"
  | "ADMIN_SELF_ACTION"
  | "ADMIN_STATE_CHANGED"
  | "ADMIN_LAST_ADMIN"
  | "ADMIN_EMAIL_MISMATCH"
  | "ADMIN_DELETE_FAILED";

export type ActionResult =
  | { ok: true }
  | { ok: false; code: ActionError; error: string };

export const ERROR_MESSAGES: Record<ActionError, string> = {
  ADMIN_NOT_FOUND: "User not found",
  ADMIN_SELF_ACTION: "You cannot suspend or delete your own admin account",
  ADMIN_STATE_CHANGED: "User state has changed — refresh the list",
  ADMIN_LAST_ADMIN: "At least one admin account must remain",
  ADMIN_EMAIL_MISMATCH: "Typed email does not match the user's email",
  ADMIN_DELETE_FAILED: "Failed to delete user — please retry",
};
