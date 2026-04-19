import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/app/_lib/db";
import { createSession } from "@/app/_lib/auth/session-store";

let tmp: string;
const ORIGINAL_ROOT = process.env.VIDEO_STORAGE_ROOT;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "videomax-admin-cleanup-"));
  process.env.VIDEO_STORAGE_ROOT = tmp;
});

afterEach(() => {
  process.env.VIDEO_STORAGE_ROOT = ORIGINAL_ROOT;
});

async function reset() {
  await prisma.video.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.user.deleteMany({});
}

async function createUserWithArtifacts() {
  const user = await prisma.user.create({
    data: {
      email: `u-${Date.now()}@example.com`,
      name: "U",
      passwordHash: "x".repeat(60),
    },
  });
  await prisma.video.create({
    data: {
      userId: user.id,
      title: "v",
      originalFilename: "v.mp4",
      sizeBytes: BigInt(1),
      containerFormat: "mp4",
      storagePath: `${user.id}/v/source.mp4`,
    },
  });
  await createSession(user.id);
  const userDir = path.join(tmp, user.id);
  mkdirSync(path.join(userDir, "v"), { recursive: true });
  writeFileSync(path.join(userDir, "v", "source.mp4"), "bytes");
  return user;
}

describe("deleteUserArtifacts (integration)", () => {
  beforeEach(async () => {
    await reset();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("cleanup_deletes_user_and_cascades_rows", async () => {
    vi.resetModules();
    const { deleteUserArtifacts } = await import("../cleanup");
    const user = await createUserWithArtifacts();
    const r = await deleteUserArtifacts(user.id);
    expect(r.ok).toBe(true);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.video.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("cleanup_removes_storage_dir_on_success", async () => {
    vi.resetModules();
    const { deleteUserArtifacts } = await import("../cleanup");
    const user = await createUserWithArtifacts();
    const userDir = path.join(tmp, user.id);
    expect(existsSync(userDir)).toBe(true);
    await deleteUserArtifacts(user.id);
    expect(existsSync(userDir)).toBe(false);
  });

  it("cleanup_logs_and_swallows_filesystem_failure", async () => {
    vi.resetModules();
    vi.doMock("@/app/_lib/videos/storage", async () => {
      const actual =
        await vi.importActual<typeof import("@/app/_lib/videos/storage")>(
          "@/app/_lib/videos/storage",
        );
      return {
        ...actual,
        removeUserStorageDir: async () => {
          throw new Error("fs down");
        },
      };
    });
    const { deleteUserArtifacts } = await import("../cleanup");
    const user = await createUserWithArtifacts();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const r = await deleteUserArtifacts(user.id);
      expect(r.ok).toBe(true);
      expect(warn).toHaveBeenCalled();
      expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    } finally {
      warn.mockRestore();
      vi.doUnmock("@/app/_lib/videos/storage");
    }
  });
});
