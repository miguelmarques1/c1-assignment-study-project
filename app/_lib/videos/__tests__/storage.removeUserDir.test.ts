import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { removeUserStorageDir } from "../storage";
import { VideoUploadError } from "../errors";

const ORIGINAL_ROOT = process.env.VIDEO_STORAGE_ROOT;
let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "videomax-storage-user-"));
  process.env.VIDEO_STORAGE_ROOT = tmp;
});

afterEach(() => {
  process.env.VIDEO_STORAGE_ROOT = ORIGINAL_ROOT;
});

describe("removeUserStorageDir", () => {
  it("remove_user_storage_dir_removes_directory_recursively", async () => {
    const userDir = path.join(tmp, "user-a");
    mkdirSync(path.join(userDir, "video-1"), { recursive: true });
    writeFileSync(path.join(userDir, "video-1", "source.mp4"), "bytes");
    expect(existsSync(userDir)).toBe(true);
    await removeUserStorageDir("user-a");
    expect(existsSync(userDir)).toBe(false);
    expect(existsSync(tmp)).toBe(true);
  });

  it("remove_user_storage_dir_is_noop_for_nonexistent_user", async () => {
    await expect(removeUserStorageDir("nobody")).resolves.toBeUndefined();
  });

  it("remove_user_storage_dir_rejects_traversal_ids", async () => {
    await expect(removeUserStorageDir("../etc")).rejects.toThrow(VideoUploadError);
    await expect(removeUserStorageDir("..")).rejects.toThrow(VideoUploadError);
  });
});
