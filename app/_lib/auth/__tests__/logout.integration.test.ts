import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("../../../../tests/setup/next-headers-mock"));

import { prisma } from "@/app/_lib/db";
import { logout } from "@/app/_lib/auth/logout";
import { createSession } from "@/app/_lib/auth/session-store";
import {
  currentSessionCookie,
  jarValues,
  resetJar,
} from "../../../../tests/setup/cookie-jar";
import { isNextRedirect, redirectPath } from "../../../../tests/setup/redirect";

describe("logout server action (integration)", () => {
  beforeEach(async () => {
    resetJar();
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("logout_deletes_session_and_clears_cookie", async () => {
    const user = await prisma.user.create({
      data: {
        email: "x@x.co",
        name: "X",
        passwordHash: "$2a$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    });
    const session = await createSession(user.id);
    resetJar({ videomax_session: session.id });

    let redirectedTo: string | null = null;
    try {
      await logout();
    } catch (err) {
      if (!isNextRedirect(err)) throw err;
      redirectedTo = redirectPath(err);
    }
    expect(redirectedTo).toBe("/");
    expect(currentSessionCookie()).toBeNull();
    const row = await prisma.session.findUnique({ where: { id: session.id } });
    expect(row).toBeNull();
  });

  it("logout_is_idempotent_when_no_session_cookie_present", async () => {
    let redirectedTo: string | null = null;
    try {
      await logout();
    } catch (err) {
      if (!isNextRedirect(err)) throw err;
      redirectedTo = redirectPath(err);
    }
    expect(redirectedTo).toBe("/");
    expect(jarValues.size).toBe(0);
  });

  it("logout_is_idempotent_when_cookie_points_to_deleted_session", async () => {
    resetJar({ videomax_session: "ghost-id-that-does-not-exist" });
    let redirectedTo: string | null = null;
    try {
      await logout();
    } catch (err) {
      if (!isNextRedirect(err)) throw err;
      redirectedTo = redirectPath(err);
    }
    expect(redirectedTo).toBe("/");
    expect(currentSessionCookie()).toBeNull();
  });
});
