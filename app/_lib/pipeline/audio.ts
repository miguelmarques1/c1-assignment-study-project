import { spawn } from "node:child_process";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

const AUDIO_EXTRACT_TIMEOUT_MS = 10 * 60_000;

export type ExtractAudioParams = {
  source: string;
  destination: string;
  signal?: AbortSignal;
};

export type ExtractAudioResult = {
  ok: boolean;
  stderr: string;
};

export async function extractAudioTrack(
  params: ExtractAudioParams,
): Promise<ExtractAudioResult> {
  const { source, destination, signal } = params;
  return new Promise<ExtractAudioResult>((resolve) => {
    let stderr = "";
    let settled = false;

    const child = spawn(
      ffmpegInstaller.path,
      [
        "-y",
        "-i",
        source,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "libopus",
        "-b:a",
        "32k",
        destination,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );

    const timer = setTimeout(() => {
      if (!settled) child.kill("SIGKILL");
    }, AUDIO_EXTRACT_TIMEOUT_MS);

    const onAbort = () => {
      if (!settled) child.kill("SIGKILL");
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, stderr });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: code === 0, stderr });
    });
  });
}
