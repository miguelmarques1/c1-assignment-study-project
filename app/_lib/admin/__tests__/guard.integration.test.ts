import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("../../../../tests/setup/next-headers-mock"));

class NotFoundError extends Error {
  digest = "NEXT_NOT_FOUND";
}

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFoundError("NEXT_NOT_FOUND");
  },
}));

import { prisma } from "@/app/_lib/db";
import { createSession } from "@/app/_lib/auth/session-store";
import { jarValues, resetJar } from "../../../../tests/setup/cookie-jar";
import { requireAdmin } from "../guard";

function setCookie(id: string) {
  jarValues.set("videomax_session", { value: id, options: {} });
}

async function createUser(
  email: string,
  overrides: Partial<{ isAdmin: boolean; isSuspended: boolean }> = {},
) {
  return prisma.user.create({
    data: {
      email,
      name: email.split("@")[0]!,
      passwordHash: "x".repeat(60),
      isAdmin: overrides.isAdmin ?? false,
      isSuspended: overrides.isSuspended ?? false,
    },
  });
}

describe("requireAdmin (integration)", () => {
  beforeEach(async () => {
    resetJar();
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("guard_returns_admin_session_for_admin_user", async () => {
    const admin = await createUser("admin@example.com", { isAdmin: true });
    const session = await createSession(admin.id);
    setCookie(session.id);
    const result = await requireAdmin();
    expect(result.id).toBe(admin.id);
    expect(result.isAdmin).toBe(true);
  });

  it("guard_calls_not_found_for_missing_session", async () => {
    await expect(requireAdmin()).rejects.toThrow(NotFoundError);
  });

  it("guard_calls_not_found_for_non_admin_session", async () => {
    const user = await createUser("user@example.com", { isAdmin: false });
    const session = await createSession(user.id);
    setCookie(session.id);
    await expect(requireAdmin()).rejects.toThrow(NotFoundError);
  });

  it("guard_calls_not_found_for_suspended_admin", async () => {
    const admin = await createUser("suspended@example.com", {
      isAdmin: true,
      isSuspended: true,
    });
    const session = await createSession(admin.id);
    setCookie(session.id);
    await expect(requireAdmin()).rejects.toThrow(NotFoundError);
  });
});
