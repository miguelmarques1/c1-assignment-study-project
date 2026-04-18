import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { extractThumbnail, probeDuration } from "../probe";

const FIXTURE = path.resolve(process.cwd(), "video-sample/video-test.mkv");

let tempDir: string;

beforeAll(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), "videomax-probe-"));
});

afterAll(() => {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {}
});

describe("probe (integration)", () => {
  it("fixture is committed", () => {
    expect(existsSync(FIXTURE)).toBe(true);
  });

  it("probeDuration returns a positive number for the fixture video", async () => {
    const duration = await probeDuration(FIXTURE);
    expect(duration).not.toBeNull();
    expect(duration! > 0).toBe(true);
  });

  it("extractThumbnail writes a non-empty JPEG file for the fixture video", async () => {
    const dest = path.join(tempDir, "thumb.jpg");
    const ok = await extractThumbnail({ source: FIXTURE, destination: dest, atSeconds: 0 });
    expect(ok).toBe(true);
    expect(existsSync(dest)).toBe(true);
    expect(statSync(dest).size).toBeGreaterThan(100);
  });
});
