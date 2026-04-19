"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/app/_lib/db";
import { requireAdmin } from "@/app/_lib/admin/guard";
import { userActionChecksum } from "@/app/_lib/admin/checksum";
import { deleteUserArtifacts } from "@/app/_lib/admin/cleanup";
import {
  ERROR_MESSAGES,
  type ActionError,
  type ActionResult,
} from "@/app/_lib/admin/errors";

function fail(code: ActionError): ActionResult {
  return { ok: false, code, error: ERROR_MESSAGES[code] };
}

async function runSuspend(formData: FormData): Promise<ActionResult> {
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

async function runReactivate(formData: FormData): Promise<ActionResult> {
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

async function runDelete(formData: FormData): Promise<ActionResult> {
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

function errorRedirect(code: ActionError): never {
  redirect(`/admin/users?error=${encodeURIComponent(code)}`);
}

export async function suspendUser(formData: FormData): Promise<ActionResult> {
  return runSuspend(formData);
}

export async function reactivateUser(formData: FormData): Promise<ActionResult> {
  return runReactivate(formData);
}

export async function deleteUser(formData: FormData): Promise<ActionResult> {
  return runDelete(formData);
}

export async function suspendUserAction(formData: FormData): Promise<void> {
  const res = await runSuspend(formData);
  if (!res.ok) errorRedirect(res.code);
}

export async function reactivateUserAction(formData: FormData): Promise<void> {
  const res = await runReactivate(formData);
  if (!res.ok) errorRedirect(res.code);
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  const res = await runDelete(formData);
  if (!res.ok) errorRedirect(res.code);
}
