import { prisma } from "@/app/_lib/db";
import { PipelineError } from "../errors";
import { summarizeText } from "../openai";
import { completeJob } from "../queue";
import { transitionStatus } from "../status";
import type { StageContext } from "./validate";

function resolveMaxChars(): number {
  const raw = process.env.SUMMARY_INPUT_MAX_CHARS;
  if (!raw) return 120_000;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120_000;
}

export function truncateTranscript(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const half = Math.floor(maxChars / 2);
  const head = text.slice(0, half);
  const tail = text.slice(text.length - half);
  return `${head}\n\n[... middle truncated ...]\n\n${tail}`;
}

export async function runSummarizeStage(ctx: StageContext): Promise<void> {
  const segments = await prisma.transcriptionSegment.findMany({
    where: { videoId: ctx.videoId },
    orderBy: { segmentIndex: "asc" },
    select: { text: true },
  });
  if (segments.length === 0) {
    throw new PipelineError(
      "PIPE_INTERNAL",
      `No transcription segments for video ${ctx.videoId}`,
      true,
    );
  }
  const concatenated = segments.map((s) => s.text).join(" ").trim();
  if (concatenated.length === 0) {
    throw new PipelineError(
      "PIPE_INTERNAL",
      `Empty transcription text for video ${ctx.videoId}`,
      true,
    );
  }

  const text = truncateTranscript(concatenated, resolveMaxChars());
  const result = await summarizeText({ text, signal: ctx.signal });

  const summaryModel = process.env.SUMMARY_MODEL || "gpt-4.1-nano";

  await prisma.$transaction(async (tx) => {
    await tx.summary.deleteMany({ where: { videoId: ctx.videoId } });
    await tx.summary.create({
      data: {
        videoId: ctx.videoId,
        overview: result.overview,
        keyTopics: result.keyTopics,
        model: summaryModel,
      },
    });
  });

  await transitionStatus({
    videoId: ctx.videoId,
    expectedFrom: "summarizing",
    to: "ready",
    stage: null,
    attempt: 0,
  });
  await completeJob(ctx.videoId);
}
