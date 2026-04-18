import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ensureUserDir,
  removeVideoDir,
  resolveVideoPaths,
  writeTempStream,
} from "../storage";
import { VideoUploadError } from "../errors";

const ORIGINAL_ROOT = process.env.VIDEO_STORAGE_ROOT;
let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "videomax-storage-"));
  process.env.VIDEO_STORAGE_ROOT = tmp;
});

afterEach(() => {
  process.env.VIDEO_STORAGE_ROOT = ORIGINAL_ROOT;
});

describe("resolveVideoPaths", () => {
  it("resolve_paths_returns_user_and_video_subdirs", () => {
    const paths = resolveVideoPaths("u1", "v1", "mp4");
    expect(paths.source.endsWith(path.join("u1", "v1", "source.mp4"))).toBe(true);
    expect(paths.thumbnail.endsWith(path.join("u1", "v1", "thumbnail.jpg"))).toBe(true);
    expect(paths.sourceRelative).toBe(path.join("u1", "v1", "source.mp4"));
  });

  it("resolve_paths_rejects_traversal_in_user_id", () => {
    expect(() => resolveVideoPaths("../etc", "v1", "mp4")).toThrow(VideoUploadError);
  });

  it("resolve_paths_rejects_traversal_in_video_id", () => {
    expect(() => resolveVideoPaths("u1", "..", "mp4")).toThrow(VideoUploadError);
  });

  it("resolve_paths_rejects_traversal_in_extension", () => {
    expect(() => resolveVideoPaths("u1", "v1", "../etc")).toThrow(VideoUploadError);
  });
});

describe("ensureUserDir", () => {
  it("creates_missing_directory", async () => {
    const dir = await ensureUserDir("user-xyz");
    expect(existsSync(dir)).toBe(true);
  });
});

describe("writeTempStream", () => {
  it("writes_bytes_and_returns_count", async () => {
    const target = path.join(tmp, "u1", "v1", "source.mp4.part");
    const input = Readable.from(Buffer.from("hello world"));
    const written = await writeTempStream(target, input, 1_000);
    expect(written).toBe("hello world".length);
    expect(readFileSync(target, "utf8")).toBe("hello world");
  });

  it("aborts_when_bytes_exceed_limit_and_removes_partial_file", async () => {
    const target = path.join(tmp, "u2", "v2", "source.mp4.part");
    // 2000 bytes, limit 1000
    const input = Readable.from(Buffer.alloc(2000, 65));
    await expect(writeTempStream(target, input, 1000)).rejects.toThrow(VideoUploadError);
    expect(existsSync(target)).toBe(false);
  });
});

describe("removeVideoDir", () => {
  it("deletes_both_files_and_dir", async () => {
    const paths = resolveVideoPaths("u9", "v9", "mp4");
    await writeTempStream(paths.source, Readable.from(Buffer.from("hello")), 100);
    await writeTempStream(paths.thumbnail, Readable.from(Buffer.from("thumb")), 100);
    expect(existsSync(paths.source)).toBe(true);
    expect(existsSync(paths.thumbnail)).toBe(true);
    await removeVideoDir("u9", "v9");
    expect(existsSync(paths.videoDir)).toBe(false);
  });
});
