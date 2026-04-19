import { prisma } from "@/app/_lib/db";
import type {
  Prisma,
  Summary,
  Transcription,
  TranscriptionSegment,
  Video,
  VideoEvent,
  VideoJob,
} from "@prisma/client";

export type CreateVideoInitialInput = {
  userId: string;
  title: string;
  originalFilename: string;
  sizeBytes: number;
  containerFormat: string;
  storagePath: string;
};

export async function createVideoInitial(
  input: CreateVideoInitialInput,
  tx?: Prisma.TransactionClient,
): Promise<Video> {
  const client = tx ?? prisma;
  return client.video.create({
    data: {
      userId: input.userId,
      title: input.title,
      originalFilename: input.originalFilename,
      sizeBytes: BigInt(input.sizeBytes),
      containerFormat: input.containerFormat,
      storagePath: input.storagePath,
      status: "validating",
    },
  });
}

export async function setDuration(
  videoId: string,
  seconds: number | null,
): Promise<void> {
  await prisma.video.update({
    where: { id: videoId },
    data: { durationSeconds: seconds ?? null },
  });
}

export async function setThumbnailPath(
  videoId: string,
  relativePath: string | null,
): Promise<void> {
  await prisma.video.update({
    where: { id: videoId },
    data: { thumbnailPath: relativePath },
  });
}

export async function findVideoForUser(
  videoId: string,
  userId: string,
): Promise<Video | null> {
  return prisma.video.findFirst({
    where: { id: videoId, userId },
  });
}

export async function deleteVideoCompletely(videoId: string): Promise<void> {
  await prisma.video.delete({ where: { id: videoId } });
}

export type VideoWithPipelineRelations = Video & {
  job: VideoJob | null;
  transcription: (Transcription & { segments: TranscriptionSegment[] }) | null;
  summary: Summary | null;
  events: VideoEvent[];
};

export async function getVideoWithPipelineRelations(
  videoId: string,
  userId: string,
): Promise<VideoWithPipelineRelations | null> {
  const row = await prisma.video.findFirst({
    where: { id: videoId, userId },
    include: {
      job: true,
      transcription: { include: { segments: { orderBy: { segmentIndex: "asc" } } } },
      summary: true,
      events: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  return row;
}
