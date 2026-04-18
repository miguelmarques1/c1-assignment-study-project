import { spawn } from "node:child_process";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

const PROBE_TIMEOUT_MS = 30_000;
const THUMB_TIMEOUT_MS = 60_000;

type SpawnResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean };

function runProcess(
  binary: string,
  args: string[],
  timeoutMs: number,
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

export async function probeDuration(filePath: string): Promise<number | null> {
  const result = await runProcess(
    ffprobeInstaller.path,
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    PROBE_TIMEOUT_MS,
  );
  if (result.code !== 0) return null;
  const parsed = Number.parseFloat(result.stdout.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 1000) / 1000;
}

export function pickThumbnailTimestamp(durationSeconds: number | null): number {
  if (!durationSeconds || durationSeconds < 1) return 0;
  return Math.min(durationSeconds * 0.1, 60);
}

export async function extractThumbnail(params: {
  source: string;
  destination: string;
  atSeconds: number;
}): Promise<boolean> {
  const { source, destination, atSeconds } = params;
  const result = await runProcess(
    ffmpegInstaller.path,
    [
      "-y",
      "-ss",
      String(Math.max(0, atSeconds)),
      "-i",
      source,
      "-frames:v",
      "1",
      "-vf",
      "scale=640:-2",
      "-q:v",
      "4",
      destination,
    ],
    THUMB_TIMEOUT_MS,
  );
  return result.code === 0;
}
