import { vi } from "vitest";
import { prisma } from "@/app/_lib/db";

type CookieStore = {
  get: (name: string) => { name: string; value: string } | undefined;
  set: (name: string, value: string, options?: Record<string, unknown>) => void;
};

export type CookieJar = {
  store: CookieStore;
  values: Map<string, { value: string; options: Record<string, unknown> }>;
  currentId(): string | null;
};

export function makeCookieJar(initial?: Record<string, string>): CookieJar {
  const values = new Map<string, { value: string; options: Record<string, unknown> }>();
  if (initial) {
    for (const [k, v] of Object.entries(initial)) {
      values.set(k, { value: v, options: {} });
    }
  }
  const store: CookieStore = {
    get(name) {
      const entry = values.get(name);
      return entry ? { name, value: entry.value } : undefined;
    },
    set(name, value, options = {}) {
      if (options.maxAge === 0 || value === "") {
        values.delete(name);
      } else {
        values.set(name, { value, options });
      }
    },
  };
  return {
    store,
    values,
    currentId() {
      return values.get("videomax_session")?.value ?? null;
    },
  };
}

export async function resetDatabase() {
  await prisma.session.deleteMany({});
  await prisma.user.deleteMany({});
}

export function isNextRedirect(err: unknown): err is Error & { digest?: string } {
  if (!err || typeof err !== "object") return false;
  const digest = (err as { digest?: string }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export function redirectPath(err: unknown): string | null {
  if (!isNextRedirect(err)) return null;
  const digest = (err as { digest?: string }).digest!;
  const parts = digest.split(";");
  return parts[2] ?? null;
}

export function mockCookies(jar: CookieJar) {
  vi.doMock("next/headers", () => ({
    cookies: vi.fn(async () => jar.store),
  }));
}
