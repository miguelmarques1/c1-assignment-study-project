import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => undefined),
    set: vi.fn(),
  })),
}));

vi.mock("@/app/_lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    session: {
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { cookies } from "next/headers";
import { prisma } from "@/app/_lib/db";
import { getSession } from "../session";

const mockedCookies = vi.mocked(cookies);

describe("getSession (unit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCookies.mockImplementation(
      async () =>
        ({
          get: () => undefined,
          set: vi.fn(),
        }) as never,
    );
  });

  it("returns_null_when_cookie_missing", async () => {
    await expect(getSession()).resolves.toBeNull();
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });
});
