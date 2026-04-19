import { prisma } from "@/app/_lib/db";
import { removeUserStorageDir } from "@/app/_lib/videos/storage";

export type CleanupResult = { ok: true } | { ok: false; error: string };

export async function deleteUserArtifacts(userId: string): Promise<CleanupResult> {
  try {
    await prisma.user.delete({ where: { id: userId } });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "delete failed",
    };
  }

  try {
    await removeUserStorageDir(userId);
  } catch (err) {
    console.warn(
      `[admin/cleanup] filesystem cleanup failed for user ${userId}:`,
      err instanceof Error ? err.message : err,
    );
  }

  return { ok: true };
}
