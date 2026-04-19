import path from "node:path";
import { access } from "node:fs/promises";
import { prisma } from "@/app/_lib/db";
import { resolveStorageRoot } from "@/app/_lib/videos/constants";
import { PipelineError } from "../errors";
import { transcribeAudio } from "../openai";
import { advanceJobStage } from "../queue";
import { transitionStatus } from "../status";
import type { StageContext } from "./validate";

export async function runTranscribeStage(ctx: StageContext): Promise<void> {
  const video = await prisma.video.findUnique({ where: { id: ctx.videoId } });
  if (!video) {
    throw new PipelineError("PIPE_INTERNAL", `Video ${ctx.videoId} not found`, false);
  }
  const storageRoot = resolveStorageRoot();
  const audioPath = path.join(storageRoot, path.dirname(video.storagePath), "audio.ogg");

  try {
    await access(audioPath);
  } catch {
    throw new PipelineError(
      "PIPE_INTERNAL",
      `Audio file missing for transcription: ${audioPath}`,
      true,
    );
  }

  const result = await transcribeAudio({ filePath: audioPath, signal: ctx.signal });
  if (result.segments.length === 0) {
    throw new PipelineError(
      "PIPE_TRANSCRIBE_API",
      "Transcription returned no segments",
      true,
    );
  }

  const whisperModel = process.env.WHISPER_MODEL || "whisper-1";

  await prisma.$transaction(async (tx) => {
    await tx.transcriptionSegment.deleteMany({ where: { videoId: ctx.videoId } });
    await tx.transcription.deleteMany({ where: { videoId: ctx.videoId } });
    const header = await tx.transcription.create({
      data: {
        videoId: ctx.videoId,
        detectedLanguage: result.language,
        model: whisperModel,
      },
    });
    for (let i = 0; i < result.segments.length; i++) {
      const s = result.segments[i];
      await tx.transcriptionSegment.create({
        data: {
          transcriptionId: header.id,
          videoId: ctx.videoId,
          segmentIndex: i,
          startSeconds: s.start,
          endSeconds: Math.max(s.end, s.start),
          text: s.text.slice(0, 2000),
        },
      });
    }
  });

  await transitionStatus({
    videoId: ctx.videoId,
    expectedFrom: "transcribing",
    to: "summarizing",
    stage: "summarize",
    attempt: 0,
  });
  await advanceJobStage({ videoId: ctx.videoId, nextStage: "summarize" });
}
