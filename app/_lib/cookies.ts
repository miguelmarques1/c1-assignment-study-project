import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "videomax_session";

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

function cookieBaseOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
  };
}

export async function setSessionCookie(sessionId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, sessionId, {
    ...cookieBaseOptions(),
    maxAge: THIRTY_DAYS_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  try {
    store.set(SESSION_COOKIE_NAME, "", {
      ...cookieBaseOptions(),
      maxAge: 0,
    });
  } catch {
    // Cookie store is read-only inside RSC; the next mutation context
    // (Server Action / Route Handler) will clear it. Swallow silently.
  }
}

export async function readSessionCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value ?? null;
}
