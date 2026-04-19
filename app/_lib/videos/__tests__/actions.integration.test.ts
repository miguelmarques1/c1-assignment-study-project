import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/app/_lib/session", () => ({
  getSession: vi.fn(),
}));

import { mkdtempSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/app/_lib/db";
import { getSession } from "@/app/_lib/session";
import {
  deleteVideo,
  editVideoDescription,
  renameVideo,
  requestRetry,
  setLibraryPreferences,
} from "../actions";
import * as storage from "../storage";

const sessionMock = vi.mocked(getSession);

let storageRoot: string;

function setSessionUser(userId: string) {
  sessionMock.mockResolvedValue({
    user: { id: userId, email: `${userId}@x.com`, name: "User", isAdmin: false },
  });
}

async function makeUser(suffix: string) {
  return prisma.user.create({
    data: {
      email: `act-${suffix}@example.com`,
      name: `User ${suffix}`,
      passwordHash:
        "$2a$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
  });
}

async function seedVideo(
  userId: string,
  title: string,
  overrides: Partial<{ status: string }> = {},
) {
  return prisma.video.create({
    data: {
      userId,
      title,
      originalFilename: `${title}.mp4`,
      sizeBytes: BigInt(1024),
      containerFormat: "mp4",
      storagePath: path.join(userId, "__seed__", "source.mp4"),
      status: overrides.status ?? "ready",
    },
  });
}

function asForm(data: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.set(k, v);
  return fd;
}

beforeEach(async () => {
  await prisma.video.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.user.deleteMany({});
  vi.restoreAllMocks();
  if (storageRoot) {
    try {
      rmSync(storageRoot, { recursive: true, force: true });
    } catch {}
  }
  storageRoot = mkdtempSync(path.join(tmpdir(), "videomax-actions-"));
  process.env.VIDEO_STORAGE_ROOT = storageRoot;
});

afterAll(async () => {
  if (storageRoot) {
    try {
      rmSync(storageRoot, { recursive: true, force: true });
    } catch {}
  }
  await prisma.$disconnect();
});

describe("renameVideo action", () => {
  it("rename_no_session_returns_LIB_FORBIDDEN", async () => {
    sessionMock.mockResolvedValue(null);
    const result = await renameVideo(
      undefined,
      asForm({ id: "x", title: "y" }),
    );
    expect(result.code).toBe("LIB_FORBIDDEN");
  });

  it("rename_happy_path_returns_updated_item", async () => {
    const user = await makeUser("r1");
    setSessionUser(user.id);
    const video = await seedVideo(user.id, "before");
    const result = await renameVideo(
      undefined,
      asForm({ id: video.id, title: "after" }),
    );
    expect(result.ok).toBe(true);
    expect(result.item?.title).toBe("after");
    const fresh = await prisma.video.findUnique({ where: { id: video.id } });
    expect(fresh?.title).toBe("after");
  });

  it("rename_empty_title_returns_LIB_TITLE_EMPTY", async () => {
    const user = await makeUser("r2");
    setSessionUser(user.id);
    const video = await seedVideo(user.id, "before");
    const result = await renameVideo(
      undefined,
      asForm({ id: video.id, title: "   " }),
    );
    expect(result.code).toBe("LIB_TITLE_EMPTY");
    const fresh = await prisma.video.findUnique({ where: { id: video.id } });
    expect(fresh?.title).toBe("before");
  });

  it("rename_non_owner_returns_LIB_NOT_FOUND", async () => {
    const owner = await makeUser("r3");
    const other = await makeUser("r4");
    setSessionUser(other.id);
    const video = await seedVideo(owner.id, "stay");
    const result = await renameVideo(
      undefined,
      asForm({ id: video.id, title: "hijack" }),
    );
    expect(result.code).toBe("LIB_NOT_FOUND");
  });

  it("rename_too_long_title_returns_LIB_TITLE_TOO_LONG", async () => {
    const user = await makeUser("r5");
    setSessionUser(user.id);
    const video = await seedVideo(user.id, "x");
    const result = await renameVideo(
      undefined,
      asForm({ id: video.id, title: "y".repeat(201) }),
    );
    expect(result.code).toBe("LIB_TITLE_TOO_LONG");
  });
});

describe("editVideoDescription action", () => {
  it("edit_description_happy_path", async () => {
    const user = await makeUser("d1");
    setSessionUser(user.id);
    const video = await seedVideo(user.id, "x");
    const result = await editVideoDescription(
      undefined,
      asForm({ id: video.id, description: "Hello world" }),
    );
    expect(result.ok).toBe(true);
    const fresh = await prisma.video.findUnique({ where: { id: video.id } });
    expect(fresh?.description).toBe("Hello world");
  });

  it("edit_description_rejects_2001_chars", async () => {
    const user = await makeUser("d2");
    setSessionUser(user.id);
    const video = await seedVideo(user.id, "x");
    const result = await editVideoDescription(
      undefined,
      asForm({ id: video.id, description: "x".repeat(2001) }),
    );
    expect(result.code).toBe("LIB_DESCRIPTION_TOO_LONG");
  });
});

describe("deleteVideo action", () => {
  it("delete_happy_path_removes_row_and_fs_dir", async () => {
    const user = await makeUser("del1");
    setSessionUser(user.id);
    const video = await seedVideo(user.id, "x");
    const dir = path.join(storageRoot, user.id, video.id);
    mkdirSync(dir, { recursive: true });
    const result = await deleteVideo(undefined, asForm({ id: video.id }));
    expect(result.ok).toBe(true);
    expect(result.filesystemWarning).toBeUndefined();
    expect(existsSync(dir)).toBe(false);
    const fresh = await prisma.video.findUnique({ where: { id: video.id } });
    expect(fresh).toBeNull();
  });

  it("delete_twice_returns_LIB_ALREADY_DELETED_on_second_call", async () => {
    const user = await makeUser("del2");
    setSessionUser(user.id);
    const video = await seedVideo(user.id, "x");
    const first = await deleteVideo(undefined, asForm({ id: video.id }));
    expect(first.ok).toBe(true);
    const second = await deleteVideo(undefined, asForm({ id: video.id }));
    expect(second.code).toBe("LIB_ALREADY_DELETED");
  });

  it("delete_filesystem_failure_still_returns_ok_with_warning", async () => {
    const user = await makeUser("del3");
    setSessionUser(user.id);
    const video = await seedVideo(user.id, "x");
    vi.spyOn(storage, "removeVideoDirSafely").mockResolvedValue({
      ok: false,
      reason: "EACCES",
    });
    const result = await deleteVideo(undefined, asForm({ id: video.id }));
    expect(result.ok).toBe(true);
    expect(result.filesystemWarning).toBe("EACCES");
    const fresh = await prisma.video.findUnique({ where: { id: video.id } });
    expect(fresh).toBeNull();
  });
});

describe("requestRetry action", () => {
  it("request_retry_happy_path_flips_failed_to_validating", async () => {
    const user = await makeUser("re1");
    setSessionUser(user.id);
    const video = await seedVideo(user.id, "x", { status: "failed" });
    const result = await requestRetry(undefined, asForm({ id: video.id }));
    expect(result.ok).toBe(true);
    expect(result.item?.status).toBe("validating");
  });

  it("request_retry_rejects_when_status_is_ready", async () => {
    const user = await makeUser("re2");
    setSessionUser(user.id);
    const video = await seedVideo(user.id, "x", { status: "ready" });
    const result = await requestRetry(undefined, asForm({ id: video.id }));
    expect(result.code).toBe("LIB_INVALID_STATUS_FOR_RETRY");
  });

  it("request_retry_rejects_for_non_owner", async () => {
    const owner = await makeUser("re3");
    const other = await makeUser("re4");
    setSessionUser(other.id);
    const video = await seedVideo(owner.id, "x", { status: "failed" });
    const result = await requestRetry(undefined, asForm({ id: video.id }));
    expect(result.code).toBe("LIB_NOT_FOUND");
  });
});

describe("setLibraryPreferences action", () => {
  it("set_preferences_persists_grid_list_toggle", async () => {
    const user = await makeUser("p1");
    setSessionUser(user.id);
    const result = await setLibraryPreferences(undefined, asForm({ view: "list" }));
    expect(result.ok).toBe(true);
    const fresh = await prisma.user.findUnique({ where: { id: user.id } });
    expect(fresh?.libraryView).toBe("list");
  });

  it("set_preferences_persists_sort", async () => {
    const user = await makeUser("p2");
    setSessionUser(user.id);
    const result = await setLibraryPreferences(
      undefined,
      asForm({ sort: "oldest" }),
    );
    expect(result.ok).toBe(true);
    const fresh = await prisma.user.findUnique({ where: { id: user.id } });
    expect(fresh?.librarySort).toBe("oldest");
  });

  it("set_preferences_rejects_unknown_view", async () => {
    const user = await makeUser("p3");
    setSessionUser(user.id);
    const result = await setLibraryPreferences(undefined, asForm({ view: "cards" }));
    expect(result.code).toBe("LIB_INVALID_VIEW");
  });

  it("set_preferences_rejects_unknown_sort", async () => {
    const user = await makeUser("p4");
    setSessionUser(user.id);
    const result = await setLibraryPreferences(
      undefined,
      asForm({ sort: "random" }),
    );
    expect(result.code).toBe("LIB_INVALID_SORT");
  });
});
