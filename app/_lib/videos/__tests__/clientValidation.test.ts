import { describe, expect, it } from "vitest";
import {
  FILE_INPUT_ACCEPT,
  reasonMessage,
  validateClientFile,
} from "../clientValidation";
import { MAX_VIDEO_BYTES } from "../constants";

function makeFile(name: string, size: number): File {
  const file = new File([new Uint8Array(Math.min(size, 16))], name, { type: "video/mp4" });
  Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

describe("validateClientFile", () => {
  it("validate_accepts_mp4_under_limit", () => {
    expect(validateClientFile(makeFile("a.mp4", 1024 * 1024))).toEqual({ ok: true });
  });

  it("validate_accepts_mov_mkv_webm_avi", () => {
    for (const name of ["a.mov", "a.mkv", "a.webm", "a.avi"]) {
      expect(validateClientFile(makeFile(name, 1024))).toEqual({ ok: true });
    }
  });

  it("validate_accepts_extension_case_insensitive_match", () => {
    expect(validateClientFile(makeFile("a.MP4", 1024))).toEqual({ ok: true });
  });

  it("validate_rejects_unknown_extension", () => {
    expect(validateClientFile(makeFile("a.mpg", 1024))).toEqual({
      ok: false,
      reason: "UPL_BAD_EXTENSION",
    });
  });

  it("validate_rejects_file_above_size_limit", () => {
    expect(validateClientFile(makeFile("a.mp4", MAX_VIDEO_BYTES + 1))).toEqual({
      ok: false,
      reason: "UPL_TOO_LARGE",
    });
  });

  it("validate_rejects_empty_file", () => {
    expect(validateClientFile(makeFile("a.mp4", 0)).ok).toBe(false);
  });

  it("validate_returns_allowed_extensions_string_for_accept_attr", () => {
    expect(FILE_INPUT_ACCEPT).toBe(".mp4,.mov,.mkv,.webm,.avi");
  });

  it("reasonMessage returns the PRD copy", () => {
    expect(reasonMessage("UPL_BAD_EXTENSION")).toBe(
      "Only MP4, MOV, MKV, WEBM, and AVI files are supported",
    );
    expect(reasonMessage("UPL_TOO_LARGE")).toBe("Files must be at most 2GB");
  });
});
