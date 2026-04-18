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

export async function getSession(): Promise<Session | null> {
  const sessionId = await readSessionCookie();
  if (!sessionId) return null;

  const row = await readSession(sessionId);
  if (!row) {
    await deleteSession(sessionId);
    await clearSessionCookie();
    return null;
  }

  const user = await prisma.user.findUnique({ where: { id: row.userId } });
  if (!user || user.isSuspended) {
    await deleteSession(sessionId);
    await clearSessionCookie();
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
