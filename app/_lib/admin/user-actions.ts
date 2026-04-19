"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/app/_lib/db";
import { requireAdmin } from "@/app/_lib/admin/guard";
import { userActionChecksum } from "@/app/_lib/admin/checksum";
import { deleteUserArtifacts } from "@/app/_lib/admin/cleanup";

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

const ERROR_MESSAGES: Record<ActionError, string> = {
  ADMIN_NOT_FOUND: "User not found",
  ADMIN_SELF_ACTION: "You cannot suspend or delete your own admin account",
  ADMIN_STATE_CHANGED: "User state has changed — refresh the list",
  ADMIN_LAST_ADMIN: "At least one admin account must remain",
  ADMIN_EMAIL_MISMATCH: "Typed email does not match the user's email",
  ADMIN_DELETE_FAILED: "Failed to delete user — please retry",
};

function fail(code: ActionError): ActionResult {
  return { ok: false, code, error: ERROR_MESSAGES[code] };
}

export async function suspendUser(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const userId = formData.get("userId");
  const checksum = formData.get("checksum");
  if (typeof userId !== "string" || !userId) return fail("ADMIN_NOT_FOUND");
  if (typeof checksum !== "string" || !checksum) return fail("ADMIN_STATE_CHANGED");
  if (userId === admin.id) return fail("ADMIN_SELF_ACTION");

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return fail("ADMIN_NOT_FOUND");
  const current = userActionChecksum({
    isSuspended: target.isSuspended,
    updatedAt: target.updatedAt,
  });
  if (current !== checksum) return fail("ADMIN_STATE_CHANGED");

  if (!target.isSuspended) {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: target.id },
        data: { isSuspended: true },
      }),
      prisma.session.deleteMany({ where: { userId: target.id } }),
    ]);
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function reactivateUser(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const userId = formData.get("userId");
  const checksum = formData.get("checksum");
  if (typeof userId !== "string" || !userId) return fail("ADMIN_NOT_FOUND");
  if (typeof checksum !== "string" || !checksum) return fail("ADMIN_STATE_CHANGED");
  if (userId === admin.id) return fail("ADMIN_SELF_ACTION");

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return fail("ADMIN_NOT_FOUND");

  if (!target.isSuspended) {
    revalidatePath("/admin/users");
    return { ok: true };
  }

  const current = userActionChecksum({
    isSuspended: target.isSuspended,
    updatedAt: target.updatedAt,
  });
  if (current !== checksum) return fail("ADMIN_STATE_CHANGED");

  await prisma.user.update({
    where: { id: target.id },
    data: { isSuspended: false },
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function deleteUser(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const userId = formData.get("userId");
  const checksum = formData.get("checksum");
  const emailConfirmation = formData.get("emailConfirmation");
  if (typeof userId !== "string" || !userId) return fail("ADMIN_NOT_FOUND");
  if (typeof checksum !== "string" || !checksum) return fail("ADMIN_STATE_CHANGED");
  if (typeof emailConfirmation !== "string") return fail("ADMIN_EMAIL_MISMATCH");
  if (userId === admin.id) return fail("ADMIN_SELF_ACTION");

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return fail("ADMIN_NOT_FOUND");

  const current = userActionChecksum({
    isSuspended: target.isSuspended,
    updatedAt: target.updatedAt,
  });
  if (current !== checksum) return fail("ADMIN_STATE_CHANGED");

  if (emailConfirmation.trim().toLowerCase() !== target.email.toLowerCase()) {
    return fail("ADMIN_EMAIL_MISMATCH");
  }

  if (target.isAdmin) {
    const otherAdmins = await prisma.user.count({
      where: { isAdmin: true, id: { not: target.id } },
    });
    if (otherAdmins === 0) return fail("ADMIN_LAST_ADMIN");
  }

  const result = await deleteUserArtifacts(target.id);
  if (!result.ok) return fail("ADMIN_DELETE_FAILED");

  revalidatePath("/admin/users");
  revalidatePath("/admin");
  return { ok: true };
}
