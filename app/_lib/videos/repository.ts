import { prisma } from "@/app/_lib/db";
import type { Prisma, Video } from "@prisma/client";

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
