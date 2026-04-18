import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("../../../../tests/setup/next-headers-mock"));

import { prisma } from "@/app/_lib/db";
import { register } from "@/app/_lib/auth/register";
import { login } from "@/app/_lib/auth/login";
import { logout } from "@/app/_lib/auth/logout";
import { getSession } from "@/app/_lib/session";
import {
  currentSessionCookie,
  resetJar,
} from "../../../../tests/setup/cookie-jar";
import { isNextRedirect } from "../../../../tests/setup/redirect";

function asForm(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}

async function runRedirecting(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    if (!isNextRedirect(err)) throw err;
  }
}

describe("auth flow end-to-end", () => {
  beforeEach(async () => {
    resetJar();
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("register_then_login_then_logout_end_to_end", async () => {
    await runRedirecting(() =>
      register(
        undefined,
        asForm({
          name: "Ada Lovelace",
          email: "ada@example.com",
          password: "analytical1",
          passwordConfirmation: "analytical1",
        }),
      ),
    );

    const afterRegister = await getSession();
    expect(afterRegister?.user.email).toBe("ada@example.com");
    expect(currentSessionCookie()).not.toBeNull();

    await runRedirecting(() => logout());
    expect(currentSessionCookie()).toBeNull();
    await expect(getSession()).resolves.toBeNull();

    await runRedirecting(() =>
      login(
        undefined,
        asForm({ email: "ada@example.com", password: "analytical1" }),
      ),
    );

    const afterLogin = await getSession();
    expect(afterLogin?.user.email).toBe("ada@example.com");

    await runRedirecting(() => logout());
    expect(currentSessionCookie()).toBeNull();
    await expect(getSession()).resolves.toBeNull();

    const user = await prisma.user.findUnique({ where: { email: "ada@example.com" } });
    expect(user).not.toBeNull();
    const remainingSessions = await prisma.session.findMany({ where: { userId: user!.id } });
    expect(remainingSessions).toHaveLength(0);
  });
});
