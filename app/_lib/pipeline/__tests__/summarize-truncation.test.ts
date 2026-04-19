import { describe, it, expect } from "vitest";
import { truncateTranscript } from "../stages/summarize";

describe("truncateTranscript", () => {
  it("returns input unchanged when under the cap", () => {
    const text = "a".repeat(500);
    expect(truncateTranscript(text, 1000)).toBe(text);
  });

  it("keeps head and tail and inserts a marker when over the cap", () => {
    const text = "A".repeat(400) + "M".repeat(400) + "Z".repeat(400);
    const out = truncateTranscript(text, 200);
    expect(out).toContain("[... middle truncated ...]");
    expect(out.startsWith("A")).toBe(true);
    expect(out.endsWith("Z")).toBe(true);
    // Middle region (M) should not appear in either side since it was truncated.
    const halves = out.split("[... middle truncated ...]");
    expect(halves[0].includes("M")).toBe(false);
    expect(halves[1].includes("M")).toBe(false);
  });
});
