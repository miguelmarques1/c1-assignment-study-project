import { describe, expect, it } from "vitest";
import { pickThumbnailTimestamp } from "../probe";

describe("pickThumbnailTimestamp", () => {
  it("caps at 60 seconds for very long videos", () => {
    expect(pickThumbnailTimestamp(3600)).toBe(60);
  });

  it("returns zero when duration is null or below one second", () => {
    expect(pickThumbnailTimestamp(null)).toBe(0);
    expect(pickThumbnailTimestamp(0.4)).toBe(0);
  });

  it("returns 10 percent otherwise", () => {
    expect(pickThumbnailTimestamp(100)).toBeCloseTo(10);
  });
});
