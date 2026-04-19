import { prisma } from "@/app/_lib/db";
import { clearSessionCookie, readSessionCookie } from "@/app/_lib/cookies";
import { readSession, refreshSession, deleteSession } from "@/app/_lib/auth/session-store";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
};

export type Session = {
  user: SessionUser;
};

async function tryClearCookie(): Promise<void> {
  // Server Components can't mutate cookies. Swallow the error so reads
  // never crash the render; the cookie is cleared on the next mutation
  // (logout, login, suspend) when the caller is a Server Action.
  try {
    await clearSessionCookie();
  } catch {}
}

export async function getSession(): Promise<Session | null> {
  const sessionId = await readSessionCookie();
  if (!sessionId) return null;

  const row = await readSession(sessionId);
  if (!row) {
    await deleteSession(sessionId);
    await tryClearCookie();
    return null;
  }

  const user = await prisma.user.findUnique({ where: { id: row.userId } });
  if (!user || user.isSuspended) {
    await deleteSession(sessionId);
    await tryClearCookie();
    return null;
  }

  await refreshSession(row);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin,
    },
  };
}
