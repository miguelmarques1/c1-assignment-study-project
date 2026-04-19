import path from "node:path";
import { access } from "node:fs/promises";
import { prisma } from "@/app/_lib/db";
import { resolveStorageRoot } from "@/app/_lib/videos/constants";
import { probeDuration } from "@/app/_lib/videos/probe";
import { extractAudioTrack } from "../audio";
import { PipelineError } from "../errors";
import { advanceJobStage } from "../queue";
import { transitionStatus } from "../status";

const MAX_DURATION_SECONDS = 2 * 60 * 60;

export type StageContext = {
  videoId: string;
  userId: string;
  attempt: number;
  signal?: AbortSignal;
};

export async function runValidateStage(ctx: StageContext): Promise<void> {
  const video = await prisma.video.findUnique({ where: { id: ctx.videoId } });
  if (!video) {
    throw new PipelineError("PIPE_INTERNAL", `Video ${ctx.videoId} not found`, false);
  }
  const storageRoot = resolveStorageRoot();
  const source = path.join(storageRoot, video.storagePath);

  try {
    await access(source);
  } catch {
    throw new PipelineError(
      "PIPE_VALIDATE_UNREADABLE",
      `Source file missing: ${video.storagePath}`,
      false,
    );
  }

  const duration = await probeDuration(source);
  if (duration == null) {
    throw new PipelineError(
      "PIPE_VALIDATE_UNREADABLE",
      "Could not probe duration",
      false,
    );
  }
  if (duration > MAX_DURATION_SECONDS) {
    throw new PipelineError(
      "PIPE_VALIDATE_TOO_LONG",
      `Videos must be at most 2 hours long (got ${duration.toFixed(1)}s)`,
      false,
    );
  }

  if (
    video.durationSeconds == null ||
    Number(video.durationSeconds.toString()) !== duration
  ) {
    await prisma.video.update({
      where: { id: ctx.videoId },
      data: { durationSeconds: duration },
    });
  }

  const audioDestination = path.join(path.dirname(source), "audio.ogg");
  const result = await extractAudioTrack({
    source,
    destination: audioDestination,
    signal: ctx.signal,
  });
  if (!result.ok) {
    throw new PipelineError(
      "PIPE_VALIDATE_UNREADABLE",
      `ffmpeg audio extraction failed: ${result.stderr.slice(-300)}`,
      false,
    );
  }

  await transitionStatus({
    videoId: ctx.videoId,
    expectedFrom: "validating",
    to: "transcribing",
    stage: "transcribe",
    attempt: 0,
  });
  await advanceJobStage({ videoId: ctx.videoId, nextStage: "transcribe" });
}
