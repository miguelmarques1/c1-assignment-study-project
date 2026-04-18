import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("../../../../tests/setup/next-headers-mock"));

import { prisma } from "@/app/_lib/db";
import { login } from "@/app/_lib/auth/login";
import { hashPassword } from "@/app/_lib/password";
import { currentSessionCookie, resetJar } from "../../../../tests/setup/cookie-jar";
import { isNextRedirect, redirectPath } from "../../../../tests/setup/redirect";

function asForm(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}

async function seedUser(
  overrides: Partial<{ email: string; password: string; suspended: boolean }> = {},
) {
  const email = overrides.email ?? "ada@example.com";
  const password = overrides.password ?? "analytical1";
  const passwordHash = await hashPassword(password);
  return prisma.user.create({
    data: {
      email,
      name: "Ada",
      passwordHash,
      isSuspended: overrides.suspended ?? false,
    },
  });
}

describe("login server action (integration)", () => {
  beforeEach(async () => {
    resetJar();
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("login_success_creates_session_and_redirects_to_app", async () => {
    const user = await seedUser();
    let redirectedTo: string | null = null;
    try {
      await login(
        undefined,
        asForm({ email: "ada@example.com", password: "analytical1" }),
      );
    } catch (err) {
      if (!isNextRedirect(err)) throw err;
      redirectedTo = redirectPath(err);
    }
    expect(redirectedTo).toBe("/app");
    const sessions = await prisma.session.findMany({ where: { userId: user.id } });
    expect(sessions).toHaveLength(1);
    expect(currentSessionCookie()).toBe(sessions[0]!.id);
  });

  it("login_unknown_email_returns_generic_error", async () => {
    const state = await login(
      undefined,
      asForm({ email: "nobody@example.com", password: "analytical1" }),
    );
    expect(state.errors?._form?.[0]).toBe("Invalid email or password");
    const sessions = await prisma.session.findMany({});
    expect(sessions).toHaveLength(0);
  });

  it("login_wrong_password_returns_generic_error", async () => {
    await seedUser();
    const state = await login(
      undefined,
      asForm({ email: "ada@example.com", password: "wrongpass1" }),
    );
    expect(state.errors?._form?.[0]).toBe("Invalid email or password");
    const sessions = await prisma.session.findMany({});
    expect(sessions).toHaveLength(0);
  });

  it("login_suspended_user_returns_generic_error", async () => {
    await seedUser({ suspended: true });
    const state = await login(
      undefined,
      asForm({ email: "ada@example.com", password: "analytical1" }),
    );
    expect(state.errors?._form?.[0]).toBe("Invalid email or password");
    const sessions = await prisma.session.findMany({});
    expect(sessions).toHaveLength(0);
  });

  it("login_validates_empty_email_or_password_with_generic_error", async () => {
    const state = await login(
      undefined,
      asForm({ email: "", password: "" }),
    );
    expect(state.errors?._form?.[0]).toBe("Invalid email or password");
    expect(state.errors?.email).toBeUndefined();
    expect(state.errors?.password).toBeUndefined();
  });

  it("login_rotates_session_cookie_on_repeat_login", async () => {
    const user = await seedUser();
    try {
      await login(
        undefined,
        asForm({ email: "ada@example.com", password: "analytical1" }),
      );
    } catch (err) {
      if (!isNextRedirect(err)) throw err;
    }
    const firstId = currentSessionCookie();
    try {
      await login(
        undefined,
        asForm({ email: "ada@example.com", password: "analytical1" }),
      );
    } catch (err) {
      if (!isNextRedirect(err)) throw err;
    }
    const secondId = currentSessionCookie();
    expect(firstId).not.toBeNull();
    expect(secondId).not.toBeNull();
    expect(secondId).not.toBe(firstId);
    const all = await prisma.session.findMany({ where: { userId: user.id } });
    expect(all.length).toBeGreaterThanOrEqual(1);
  });
});
