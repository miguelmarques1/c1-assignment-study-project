import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("../../../tests/setup/next-headers-mock"));

import { prisma } from "@/app/_lib/db";
import { getSession } from "@/app/_lib/session";
import { createSession, generateSessionId } from "@/app/_lib/auth/session-store";
import {
  currentSessionCookie,
  resetJar,
} from "../../../tests/setup/cookie-jar";

async function makeUser(
  overrides: Partial<{ email: string; isAdmin: boolean; suspended: boolean }> = {},
) {
  return prisma.user.create({
    data: {
      email: overrides.email ?? "user@example.com",
      name: "Ada",
      passwordHash:
        "$2a$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      isAdmin: overrides.isAdmin ?? false,
      isSuspended: overrides.suspended ?? false,
    },
  });
}

describe("getSession (integration)", () => {
  beforeEach(async () => {
    resetJar();
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("get_session_returns_null_when_cookie_missing", async () => {
    await expect(getSession()).resolves.toBeNull();
  });

  it("get_session_returns_user_when_cookie_valid", async () => {
    const user = await makeUser();
    const session = await createSession(user.id);
    resetJar({ videomax_session: session.id });
    const result = await getSession();
    expect(result?.user.id).toBe(user.id);
    expect(result?.user.email).toBe(user.email);
    expect(result?.user.name).toBe(user.name);
    expect(result?.user.isAdmin).toBe(false);
  });

  it("get_session_returns_null_when_session_expired", async () => {
    const user = await makeUser();
    const id = generateSessionId();
    await prisma.session.create({
      data: {
        id,
        userId: user.id,
        expiresAt: new Date(Date.now() - 1000),
        absoluteExpiresAt: new Date(Date.now() + 60_000_000),
      },
    });
    resetJar({ videomax_session: id });
    await expect(getSession()).resolves.toBeNull();
    expect(currentSessionCookie()).toBeNull();
  });

  it("get_session_returns_null_when_absolute_cap_passed", async () => {
    const user = await makeUser();
    const id = generateSessionId();
    await prisma.session.create({
      data: {
        id,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() - 1_000),
      },
    });
    resetJar({ videomax_session: id });
    await expect(getSession()).resolves.toBeNull();
    expect(currentSessionCookie()).toBeNull();
  });

  it("get_session_returns_null_when_user_suspended", async () => {
    const user = await makeUser({ suspended: true });
    const session = await createSession(user.id);
    resetJar({ videomax_session: session.id });
    await expect(getSession()).resolves.toBeNull();
  });

  it("get_session_exposes_is_admin_true_for_admin_user", async () => {
    const user = await makeUser({ email: "admin@example.com", isAdmin: true });
    const session = await createSession(user.id);
    resetJar({ videomax_session: session.id });
    const result = await getSession();
    expect(result?.user.isAdmin).toBe(true);
  });
});
