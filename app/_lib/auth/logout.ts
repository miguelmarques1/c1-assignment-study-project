"use server";

import { redirect } from "next/navigation";
import { clearSessionCookie, readSessionCookie } from "@/app/_lib/cookies";
import { deleteSession } from "@/app/_lib/auth/session-store";

export async function logout(): Promise<void> {
  const sessionId = await readSessionCookie();
  if (sessionId) {
    await deleteSession(sessionId);
  }
  await clearSessionCookie();
  redirect("/");
}
