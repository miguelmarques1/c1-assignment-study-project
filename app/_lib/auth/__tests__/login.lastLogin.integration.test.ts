import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("../../../../tests/setup/next-headers-mock"));

import { prisma } from "@/app/_lib/db";
import { login } from "@/app/_lib/auth/login";
import { hashPassword } from "@/app/_lib/password";
import { resetJar } from "../../../../tests/setup/cookie-jar";
import { isNextRedirect } from "../../../../tests/setup/redirect";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

async function seedUser(email = "ada@example.com", password = "analytical1") {
  const passwordHash = await hashPassword(password);
  return prisma.user.create({
    data: { email, name: "Ada", passwordHash },
  });
}

async function runLogin(email: string, password: string) {
  try {
    await login(undefined, form({ email, password }));
    return { redirected: false, state: undefined };
  } catch (err) {
    if (!isNextRedirect(err)) throw err;
    return { redirected: true, state: undefined };
  }
}

describe("login stamps last_login_at (integration)", () => {
  beforeEach(async () => {
    resetJar();
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("login_success_stamps_last_login_at", async () => {
    const user = await seedUser();
    const before = Date.now();
    await runLogin(user.email, "analytical1");
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(fresh.lastLoginAt).not.toBeNull();
    const ts = fresh.lastLoginAt!.getTime();
    expect(ts).toBeGreaterThanOrEqual(before - 100);
    expect(ts).toBeLessThanOrEqual(Date.now() + 100);
  });

  it("login_failure_does_not_stamp_last_login_at", async () => {
    const user = await seedUser();
    await runLogin(user.email, "wrong-password");
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(fresh.lastLoginAt).toBeNull();
  });

  it("login_updates_last_login_at_on_repeat_login", async () => {
    const user = await seedUser();
    await runLogin(user.email, "analytical1");
    const first = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(first.lastLoginAt).not.toBeNull();
    await new Promise((r) => setTimeout(r, 15));
    await runLogin(user.email, "analytical1");
    const second = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(second.lastLoginAt!.getTime()).toBeGreaterThan(
      first.lastLoginAt!.getTime(),
    );
  });
});
