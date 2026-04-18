import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

vi.mock("next/headers", () => import("../../../../tests/setup/next-headers-mock"));
vi.mock("@ffprobe-installer/ffprobe", () => ({
  default: { path: "/usr/bin/env" },
}));
vi.mock("@ffmpeg-installer/ffmpeg", () => ({
  default: { path: "/usr/bin/env" },
}));

import { prisma } from "@/app/_lib/db";
import { uploadVideo } from "../upload";
import * as probe from "../probe";

let storageRoot: string;

async function makeUser(email = "u@example.com") {
  return prisma.user.create({
    data: {
      email,
      name: "Ada",
      passwordHash:
        "$2a$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
  });
}

function streamOf(bytes: Buffer): Readable {
  return Readable.from(bytes);
}

beforeAll(() => {
  storageRoot = mkdtempSync(path.join(tmpdir(), "videomax-upload-"));
  process.env.VIDEO_STORAGE_ROOT = storageRoot;
  process.env.VIDEO_MAX_BYTES = String(10 * 1024 * 1024);
});

afterAll(async () => {
  await prisma.$disconnect();
  try {
    rmSync(storageRoot, { recursive: true, force: true });
  } catch {}
});

beforeEach(async () => {
  await prisma.video.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.user.deleteMany({});
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("uploadVideo", () => {
  it("upload_persists_row_and_file_on_happy_path", async () => {
    vi.spyOn(probe, "probeDuration").mockResolvedValue(42.5);
    vi.spyOn(probe, "extractThumbnail").mockResolvedValue(true);

    const user = await makeUser();
    const bytes = Buffer.from("hello world");
    const dto = await uploadVideo({
      userId: user.id,
      requestStream: streamOf(bytes),
      declaredName: "clip.mp4",
      declaredSize: bytes.length,
    });

    expect(dto.status).toBe("validating");
    expect(dto.sizeBytes).toBe(bytes.length);
    expect(dto.containerFormat).toBe("mp4");
    expect(dto.durationSeconds).toBeCloseTo(42.5);
    expect(dto.hasCustomThumbnail).toBe(true);
    expect(dto.thumbnailUrl).toBe(`/api/videos/${dto.id}/thumbnail`);

    const row = await prisma.video.findUniqueOrThrow({ where: { id: dto.id } });
    expect(existsSync(path.join(storageRoot, row.storagePath))).toBe(true);
  });

  it("upload_sets_default_title_to_filename_without_extension", async () => {
    vi.spyOn(probe, "probeDuration").mockResolvedValue(null);
    vi.spyOn(probe, "extractThumbnail").mockResolvedValue(false);
    const user = await makeUser("a@example.com");
    const bytes = Buffer.from("x");
    const dto = await uploadVideo({
      userId: user.id,
      requestStream: streamOf(bytes),
      declaredName: "morning-standup.mp4",
      declaredSize: bytes.length,
    });
    expect(dto.title).toBe("morning-standup");
  });

  it("upload_truncates_title_to_200_chars", async () => {
    vi.spyOn(probe, "probeDuration").mockResolvedValue(null);
    vi.spyOn(probe, "extractThumbnail").mockResolvedValue(false);
    const user = await makeUser("b@example.com");
    const longName = "a".repeat(220) + ".mp4";
    const bytes = Buffer.from("x");
    const dto = await uploadVideo({
      userId: user.id,
      requestStream: streamOf(bytes),
      declaredName: longName,
      declaredSize: bytes.length,
    });
    expect(dto.title.length).toBe(200);
  });

  it("upload_rejects_oversized_stream_with_UPL_TOO_LARGE", async () => {
    const user = await makeUser("c@example.com");
    const bytes = Buffer.alloc(11 * 1024 * 1024);
    await expect(
      uploadVideo({
        userId: user.id,
        requestStream: streamOf(bytes),
        declaredName: "huge.mp4",
        declaredSize: bytes.length,
      }),
    ).rejects.toMatchObject({ code: "UPL_TOO_LARGE" });
    expect(await prisma.video.count()).toBe(0);
  });

  it("upload_rejects_unsupported_extension_with_UPL_BAD_EXTENSION", async () => {
    const user = await makeUser("d@example.com");
    const bytes = Buffer.from("x");
    await expect(
      uploadVideo({
        userId: user.id,
        requestStream: streamOf(bytes),
        declaredName: "clip.mpg",
        declaredSize: bytes.length,
      }),
    ).rejects.toMatchObject({ code: "UPL_BAD_EXTENSION" });
    expect(await prisma.video.count()).toBe(0);
  });

  it("upload_leaves_duration_null_when_probe_fails", async () => {
    vi.spyOn(probe, "probeDuration").mockResolvedValue(null);
    vi.spyOn(probe, "extractThumbnail").mockResolvedValue(false);
    const user = await makeUser("e@example.com");
    const bytes = Buffer.from("x");
    const dto = await uploadVideo({
      userId: user.id,
      requestStream: streamOf(bytes),
      declaredName: "clip.mp4",
      declaredSize: bytes.length,
    });
    expect(dto.durationSeconds).toBeNull();
    expect(dto.status).toBe("validating");
  });

  it("upload_leaves_thumbnail_null_when_extraction_fails", async () => {
    vi.spyOn(probe, "probeDuration").mockResolvedValue(10);
    vi.spyOn(probe, "extractThumbnail").mockResolvedValue(false);
    const user = await makeUser("f@example.com");
    const bytes = Buffer.from("x");
    const dto = await uploadVideo({
      userId: user.id,
      requestStream: streamOf(bytes),
      declaredName: "clip.mp4",
      declaredSize: bytes.length,
    });
    expect(dto.hasCustomThumbnail).toBe(false);
  });

  it("upload_scopes_file_under_user_directory", async () => {
    vi.spyOn(probe, "probeDuration").mockResolvedValue(null);
    vi.spyOn(probe, "extractThumbnail").mockResolvedValue(false);
    const userA = await makeUser("a2@example.com");
    const userB = await makeUser("b2@example.com");
    const bytes = Buffer.from("xy");
    const a = await uploadVideo({
      userId: userA.id,
      requestStream: streamOf(bytes),
      declaredName: "same.mp4",
      declaredSize: bytes.length,
    });
    const b = await uploadVideo({
      userId: userB.id,
      requestStream: streamOf(bytes),
      declaredName: "same.mp4",
      declaredSize: bytes.length,
    });
    const rowA = await prisma.video.findUniqueOrThrow({ where: { id: a.id } });
    const rowB = await prisma.video.findUniqueOrThrow({ where: { id: b.id } });
    expect(rowA.storagePath.startsWith(userA.id)).toBe(true);
    expect(rowB.storagePath.startsWith(userB.id)).toBe(true);
    expect(rowA.storagePath).not.toBe(rowB.storagePath);
  });

  it("upload_appears_with_validating_status_for_library_query", async () => {
    vi.spyOn(probe, "probeDuration").mockResolvedValue(null);
    vi.spyOn(probe, "extractThumbnail").mockResolvedValue(false);
    const user = await makeUser("g@example.com");
    const bytes = Buffer.from("x");
    await uploadVideo({
      userId: user.id,
      requestStream: streamOf(bytes),
      declaredName: "clip.mp4",
      declaredSize: bytes.length,
    });
    const rows = await prisma.video.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("validating");
  });
});
