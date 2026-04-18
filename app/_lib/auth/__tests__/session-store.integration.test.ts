import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/app/_lib/db";
import {
  createSession,
  deleteAllSessionsForUser,
  deleteSession,
  generateSessionId,
  readSession,
  refreshSession,
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_SLIDING_TTL_MS,
} from "@/app/_lib/auth/session-store";

async function makeUser(overrides: Partial<{ email: string }> = {}) {
  return prisma.user.create({
    data: {
      email: overrides.email ?? `u-${Math.random().toString(36).slice(2)}@example.com`,
      name: "Test",
      passwordHash: "$2a$12$placeholderplaceholderplaceholderplaceholderplaceholde",
    },
  });
}

describe("session-store (integration)", () => {
  beforeEach(async () => {
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("create_session_returns_base64url_id_and_inserts_row", async () => {
    const user = await makeUser();
    const session = await createSession(user.id);
    expect(session.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session.userId).toBe(user.id);

    const approxSliding = Date.now() + SESSION_SLIDING_TTL_MS;
    const approxAbsolute = Date.now() + SESSION_ABSOLUTE_TTL_MS;
    expect(
      Math.abs(session.expiresAt.getTime() - approxSliding),
    ).toBeLessThan(5_000);
    expect(
      Math.abs(session.absoluteExpiresAt.getTime() - approxAbsolute),
    ).toBeLessThan(5_000);
  });

  it("read_session_returns_row_when_fresh", async () => {
    const user = await makeUser();
    const session = await createSession(user.id);
    const row = await readSession(session.id);
    expect(row?.id).toBe(session.id);
  });

  it("read_session_returns_null_when_expired", async () => {
    const user = await makeUser();
    const id = generateSessionId();
    await prisma.session.create({
      data: {
        id,
        userId: user.id,
        expiresAt: new Date(Date.now() - 1_000),
        absoluteExpiresAt: new Date(Date.now() + SESSION_ABSOLUTE_TTL_MS),
      },
    });
    await expect(readSession(id)).resolves.toBeNull();
  });

  it("read_session_returns_null_when_absolute_cap_passed", async () => {
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
    await expect(readSession(id)).resolves.toBeNull();
  });

  it("refresh_does_not_write_when_session_is_under_one_day_old", async () => {
    const user = await makeUser();
    const session = await createSession(user.id);
    const before = session.expiresAt.getTime();
    const after = await refreshSession(session);
    expect(after.expiresAt.getTime()).toBe(before);
  });

  it("refresh_slides_expires_at_when_more_than_one_day_elapsed", async () => {
    const user = await makeUser();
    const id = generateSessionId();
    const now = Date.now();
    const old = await prisma.session.create({
      data: {
        id,
        userId: user.id,
        expiresAt: new Date(now + SESSION_SLIDING_TTL_MS - 2 * 24 * 60 * 60 * 1000),
        absoluteExpiresAt: new Date(now + SESSION_ABSOLUTE_TTL_MS),
      },
    });
    const refreshed = await refreshSession(old);
    expect(refreshed.expiresAt.getTime()).toBeGreaterThan(old.expiresAt.getTime());
  });

  it("refresh_never_moves_expires_at_past_absolute_cap", async () => {
    const user = await makeUser();
    const id = generateSessionId();
    const now = Date.now();
    const absolute = new Date(now + 60 * 1000);
    const session = await prisma.session.create({
      data: {
        id,
        userId: user.id,
        expiresAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
        absoluteExpiresAt: absolute,
      },
    });
    const refreshed = await refreshSession(session);
    expect(refreshed.expiresAt.getTime()).toBeLessThanOrEqual(absolute.getTime());
  });

  it("delete_session_removes_row", async () => {
    const user = await makeUser();
    const session = await createSession(user.id);
    await deleteSession(session.id);
    await expect(readSession(session.id)).resolves.toBeNull();
  });

  it("delete_all_for_user_removes_every_row_for_user", async () => {
    const user = await makeUser();
    await createSession(user.id);
    await createSession(user.id);
    await createSession(user.id);
    await deleteAllSessionsForUser(user.id);
    const remaining = await prisma.session.findMany({ where: { userId: user.id } });
    expect(remaining).toHaveLength(0);
  });
});
