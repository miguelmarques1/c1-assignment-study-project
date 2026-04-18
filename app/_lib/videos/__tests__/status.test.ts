import { describe, expect, it } from "vitest";
import { VIDEO_STATUSES, isVideoStatus } from "../status";

describe("video status enum", () => {
  it("exposes the exact set of statuses", () => {
    expect(VIDEO_STATUSES).toEqual([
      "validating",
      "transcribing",
      "summarizing",
      "ready",
      "failed",
    ]);
  });

  it("isVideoStatus accepts each allowed value", () => {
    for (const s of VIDEO_STATUSES) {
      expect(isVideoStatus(s)).toBe(true);
    }
  });

  it("isVideoStatus rejects unknown values and non-strings", () => {
    expect(isVideoStatus("unknown")).toBe(false);
    expect(isVideoStatus("")).toBe(false);
    expect(isVideoStatus(null)).toBe(false);
    expect(isVideoStatus(42)).toBe(false);
  });
});
