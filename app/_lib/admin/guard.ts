import { notFound } from "next/navigation";
import { getSession, type SessionUser } from "@/app/_lib/session";

export async function requireAdmin(): Promise<SessionUser> {
  const session = await getSession();
  if (!session || !session.user.isAdmin) {
    notFound();
  }
  return session.user;
}
