import { randomBytes } from "node:crypto";
import type { Session } from "@prisma/client";
import { prisma } from "@/app/_lib/db";

const SLIDING_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ABSOLUTE_TTL_MS = 60 * 24 * 60 * 60 * 1000;
const SLIDE_REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export function generateSessionId(): string {
  return randomBytes(32).toString("base64url");
}

export const SESSION_SLIDING_TTL_MS = SLIDING_TTL_MS;
export const SESSION_ABSOLUTE_TTL_MS = ABSOLUTE_TTL_MS;

export async function createSession(userId: string): Promise<Session> {
  const now = Date.now();
  return prisma.session.create({
    data: {
      id: generateSessionId(),
      userId,
      expiresAt: new Date(now + SLIDING_TTL_MS),
      absoluteExpiresAt: new Date(now + ABSOLUTE_TTL_MS),
    },
  });
}

export async function readSession(id: string): Promise<Session | null> {
  if (!id) return null;
  const session = await prisma.session.findUnique({ where: { id } });
  if (!session) return null;
  const now = new Date();
  if (session.expiresAt <= now || session.absoluteExpiresAt <= now) {
    return null;
  }
  return session;
}

export async function refreshSession(session: Session): Promise<Session> {
  const now = Date.now();
  const currentExpiresMs = session.expiresAt.getTime();
  const remaining = currentExpiresMs - now;
  const elapsedSinceFullTtl = SLIDING_TTL_MS - remaining;
  if (elapsedSinceFullTtl < SLIDE_REFRESH_THRESHOLD_MS) {
    return session;
  }
  const proposed = now + SLIDING_TTL_MS;
  const capped = Math.min(proposed, session.absoluteExpiresAt.getTime());
  return prisma.session.update({
    where: { id: session.id },
    data: { expiresAt: new Date(capped) },
  });
}

export async function deleteSession(id: string): Promise<void> {
  if (!id) return;
  await prisma.session.deleteMany({ where: { id } });
}

export async function deleteAllSessionsForUser(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}
