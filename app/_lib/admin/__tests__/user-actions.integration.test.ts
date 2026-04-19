import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

vi.mock("next/headers", () => import("../../../../tests/setup/next-headers-mock"));

class NotFoundError extends Error {
  digest = "NEXT_NOT_FOUND";
}

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFoundError("NEXT_NOT_FOUND");
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { prisma } from "@/app/_lib/db";
import { createSession } from "@/app/_lib/auth/session-store";
import { hashPassword } from "@/app/_lib/password";
import { login } from "@/app/_lib/auth/login";
import { userActionChecksum } from "../checksum";
import { suspendUser, reactivateUser, deleteUser } from "../user-actions";
import { jarValues, resetJar } from "../../../../tests/setup/cookie-jar";

let tmp: string;
const ORIGINAL_ROOT = process.env.VIDEO_STORAGE_ROOT;

beforeEach(async () => {
  tmp = mkdtempSync(path.join(tmpdir(), "videomax-admin-actions-"));
  process.env.VIDEO_STORAGE_ROOT = tmp;
  resetJar();
  await prisma.video.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.user.deleteMany({});
});

afterEach(() => {
  process.env.VIDEO_STORAGE_ROOT = ORIGINAL_ROOT;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createUser(
  email: string,
  overrides: Partial<{
    isAdmin: boolean;
    isSuspended: boolean;
    password: string;
  }> = {},
) {
  return prisma.user.create({
    data: {
      email,
      name: email.split("@")[0]!,
      passwordHash: await hashPassword(overrides.password ?? "analytical1"),
      isAdmin: overrides.isAdmin ?? false,
      isSuspended: overrides.isSuspended ?? false,
    },
  });
}

async function loginAsAdmin(email = "admin-actions@example.com") {
  const admin = await createUser(email, { isAdmin: true });
  const session = await createSession(admin.id);
  jarValues.set("videomax_session", { value: session.id, options: {} });
  return admin;
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("suspendUser", () => {
  it("suspend_sets_is_suspended_true_and_kills_sessions", async () => {
    await loginAsAdmin();
    const target = await createUser("target-suspend@example.com");
    await createSession(target.id);
    await createSession(target.id);
    const checksum = userActionChecksum({
      isSuspended: target.isSuspended,
      updatedAt: target.updatedAt,
    });
    const res = await suspendUser(form({ userId: target.id, checksum }));
    expect(res).toEqual({ ok: true });
    const updated = await prisma.user.findUnique({ where: { id: target.id } });
    expect(updated?.isSuspended).toBe(true);
    const sessions = await prisma.session.count({
      where: { userId: target.id },
    });
    expect(sessions).toBe(0);
  });

  it("suspend_blocks_subsequent_login", async () => {
    await loginAsAdmin();
    const target = await createUser("lockout@example.com");
    const checksum = userActionChecksum({
      isSuspended: target.isSuspended,
      updatedAt: target.updatedAt,
    });
    await suspendUser(form({ userId: target.id, checksum }));
    const loginForm = new FormData();
    loginForm.set("email", "lockout@example.com");
    loginForm.set("password", "analytical1");
    const result = await login(undefined, loginForm);
    expect(result?.errors?._form?.[0]).toBe("Invalid email or password");
  });

  it("suspend_rejects_self_target", async () => {
    const admin = await loginAsAdmin();
    const checksum = userActionChecksum({
      isSuspended: false,
      updatedAt: admin.updatedAt,
    });
    const res = await suspendUser(form({ userId: admin.id, checksum }));
    expect(res).toMatchObject({ ok: false, code: "ADMIN_SELF_ACTION" });
    const a = await prisma.user.findUnique({ where: { id: admin.id } });
    expect(a?.isSuspended).toBe(false);
  });

  it("suspend_rejects_stale_checksum", async () => {
    await loginAsAdmin();
    const target = await createUser("stale@example.com");
    const res = await suspendUser(
      form({ userId: target.id, checksum: "bogus:0" }),
    );
    expect(res).toMatchObject({ ok: false, code: "ADMIN_STATE_CHANGED" });
  });
});

describe("reactivateUser", () => {
  it("reactivate_sets_is_suspended_false", async () => {
    await loginAsAdmin();
    const target = await createUser("react@example.com", {
      isSuspended: true,
    });
    const checksum = userActionChecksum({
      isSuspended: target.isSuspended,
      updatedAt: target.updatedAt,
    });
    const res = await reactivateUser(form({ userId: target.id, checksum }));
    expect(res).toEqual({ ok: true });
    const updated = await prisma.user.findUnique({ where: { id: target.id } });
    expect(updated?.isSuspended).toBe(false);
  });

  it("reactivate_is_noop_when_user_already_active", async () => {
    await loginAsAdmin();
    const target = await createUser("already-active@example.com");
    const res = await reactivateUser(
      form({ userId: target.id, checksum: "whatever:0" }),
    );
    expect(res).toEqual({ ok: true });
  });
});

describe("deleteUser", () => {
  async function seedTargetWithFiles(email = "bye@example.com") {
    const target = await createUser(email);
    await prisma.video.create({
      data: {
        userId: target.id,
        title: "v",
        originalFilename: "v.mp4",
        sizeBytes: BigInt(1),
        containerFormat: "mp4",
        storagePath: `${target.id}/v/source.mp4`,
      },
    });
    await createSession(target.id);
    await createSession(target.id);
    const userDir = path.join(tmp, target.id);
    mkdirSync(path.join(userDir, "v"), { recursive: true });
    writeFileSync(path.join(userDir, "v", "source.mp4"), "bytes");
    return target;
  }

  it("delete_cascades_to_videos_and_sessions_via_fk", async () => {
    await loginAsAdmin();
    const target = await seedTargetWithFiles("cascade@example.com");
    const checksum = userActionChecksum({
      isSuspended: target.isSuspended,
      updatedAt: target.updatedAt,
    });
    const res = await deleteUser(
      form({
        userId: target.id,
        checksum,
        emailConfirmation: target.email,
      }),
    );
    expect(res).toEqual({ ok: true });
    expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
    expect(await prisma.video.count({ where: { userId: target.id } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: target.id } })).toBe(0);
  });

  it("delete_removes_user_storage_directory", async () => {
    await loginAsAdmin();
    const target = await seedTargetWithFiles("fs@example.com");
    const userDir = path.join(tmp, target.id);
    expect(existsSync(userDir)).toBe(true);
    const checksum = userActionChecksum({
      isSuspended: target.isSuspended,
      updatedAt: target.updatedAt,
    });
    await deleteUser(
      form({
        userId: target.id,
        checksum,
        emailConfirmation: target.email,
      }),
    );
    expect(existsSync(userDir)).toBe(false);
  });

  it("delete_rejects_when_typed_email_does_not_match", async () => {
    await loginAsAdmin();
    const target = await createUser("nope@example.com");
    const checksum = userActionChecksum({
      isSuspended: target.isSuspended,
      updatedAt: target.updatedAt,
    });
    const res = await deleteUser(
      form({
        userId: target.id,
        checksum,
        emailConfirmation: "wrong@example.com",
      }),
    );
    expect(res).toMatchObject({ ok: false, code: "ADMIN_EMAIL_MISMATCH" });
    expect(await prisma.user.findUnique({ where: { id: target.id } })).not.toBeNull();
  });

  it("delete_rejects_self_target", async () => {
    const admin = await loginAsAdmin();
    const checksum = userActionChecksum({
      isSuspended: admin.isSuspended,
      updatedAt: admin.updatedAt,
    });
    const res = await deleteUser(
      form({
        userId: admin.id,
        checksum,
        emailConfirmation: admin.email,
      }),
    );
    expect(res).toMatchObject({ ok: false, code: "ADMIN_SELF_ACTION" });
    expect(await prisma.user.findUnique({ where: { id: admin.id } })).not.toBeNull();
  });

  it("delete_allows_deleting_a_non_last_admin", async () => {
    await loginAsAdmin();
    const otherAdmin = await createUser("other-admin@example.com", {
      isAdmin: true,
    });
    const checksum = userActionChecksum({
      isSuspended: otherAdmin.isSuspended,
      updatedAt: otherAdmin.updatedAt,
    });
    const res = await deleteUser(
      form({
        userId: otherAdmin.id,
        checksum,
        emailConfirmation: otherAdmin.email,
      }),
    );
    expect(res).toEqual({ ok: true });
    const remainingAdmins = await prisma.user.count({
      where: { isAdmin: true },
    });
    expect(remainingAdmins).toBe(1);
  });

  it("delete_rejects_last_admin_when_no_other_admin_exists", async () => {
    // Reachable only via a narrow race between requireAdmin() and the
    // count check. We simulate that race by stubbing prisma.user.count
    // on the "other admins" predicate to return 0.
    await loginAsAdmin();
    const target = await createUser("last@example.com", { isAdmin: true });
    const checksum = userActionChecksum({
      isSuspended: target.isSuspended,
      updatedAt: target.updatedAt,
    });
    const originalCount = prisma.user.count.bind(prisma.user);
    const spy = vi
      .spyOn(prisma.user, "count")
      // @ts-expect-error — Prisma generics make a precise type impractical here
      .mockImplementation((args?: unknown) => {
        const where = (args as { where?: { isAdmin?: unknown } } | undefined)?.where;
        if (where?.isAdmin === true) return Promise.resolve(0);
        return originalCount(args as never) as Promise<number>;
      });
    try {
      const res = await deleteUser(
        form({
          userId: target.id,
          checksum,
          emailConfirmation: target.email,
        }),
      );
      expect(res).toMatchObject({ ok: false, code: "ADMIN_LAST_ADMIN" });
      expect(
        await originalCount.call(prisma.user, { where: { id: target.id } }),
      ).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("delete_rejects_stale_checksum", async () => {
    await loginAsAdmin();
    const target = await createUser("stale-delete@example.com");
    const res = await deleteUser(
      form({
        userId: target.id,
        checksum: "stale:0",
        emailConfirmation: target.email,
      }),
    );
    expect(res).toMatchObject({ ok: false, code: "ADMIN_STATE_CHANGED" });
  });
});

describe("concurrent admin actions", () => {
  it("concurrent_admin_actions_on_same_user_produce_state_changed_error_on_the_second", async () => {
    await loginAsAdmin();
    const target = await createUser("concurrent@example.com");
    const checksum = userActionChecksum({
      isSuspended: target.isSuspended,
      updatedAt: target.updatedAt,
    });
    const first = await suspendUser(form({ userId: target.id, checksum }));
    const second = await suspendUser(form({ userId: target.id, checksum }));
    expect(first).toEqual({ ok: true });
    expect(second).toMatchObject({
      ok: false,
      code: "ADMIN_STATE_CHANGED",
    });
  });
});
