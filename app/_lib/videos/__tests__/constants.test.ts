import { describe, expect, it, afterEach } from "vitest";
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  FILE_INPUT_ACCEPT,
  containerFormatOf,
  extensionOf,
  resolveMaxVideoBytes,
  resolveStorageRoot,
} from "../constants";

const PREV_MAX = process.env.VIDEO_MAX_BYTES;
const PREV_ROOT = process.env.VIDEO_STORAGE_ROOT;

afterEach(() => {
  process.env.VIDEO_MAX_BYTES = PREV_MAX;
  process.env.VIDEO_STORAGE_ROOT = PREV_ROOT;
});

describe("constants", () => {
  it("allowed extensions and mime types cover the PRD list", () => {
    expect(ALLOWED_EXTENSIONS).toEqual([".mp4", ".mov", ".mkv", ".webm", ".avi"]);
    expect(ALLOWED_MIME_TYPES).toContain("video/mp4");
    expect(ALLOWED_MIME_TYPES).toContain("video/webm");
    expect(ALLOWED_MIME_TYPES).toContain("video/x-msvideo");
  });

  it("file input accept string matches the allowed extensions", () => {
    expect(FILE_INPUT_ACCEPT).toBe(".mp4,.mov,.mkv,.webm,.avi");
  });

  it("extensionOf normalizes case and rejects unknown extensions", () => {
    expect(extensionOf("movie.MP4")).toBe(".mp4");
    expect(extensionOf("path/to/file.WEBM")).toBe(".webm");
    expect(extensionOf("bad.mpg")).toBeNull();
    expect(extensionOf("no-ext")).toBeNull();
  });

  it("containerFormatOf returns the lowercase extension without the dot", () => {
    expect(containerFormatOf("clip.MOV")).toBe("mov");
    expect(containerFormatOf("bad.txt")).toBeNull();
  });

  it("resolveMaxVideoBytes defaults to 2 GiB and honors env override", () => {
    delete process.env.VIDEO_MAX_BYTES;
    expect(resolveMaxVideoBytes()).toBe(2 * 1024 * 1024 * 1024);
    process.env.VIDEO_MAX_BYTES = "1000000";
    expect(resolveMaxVideoBytes()).toBe(1_000_000);
    process.env.VIDEO_MAX_BYTES = "nonsense";
    expect(resolveMaxVideoBytes()).toBe(2 * 1024 * 1024 * 1024);
  });

  it("resolveStorageRoot defaults under the project root and honors env override", () => {
    delete process.env.VIDEO_STORAGE_ROOT;
    expect(resolveStorageRoot()).toContain("storage/videos");
    process.env.VIDEO_STORAGE_ROOT = "/tmp/custom";
    expect(resolveStorageRoot()).toBe("/tmp/custom");
  });
});
