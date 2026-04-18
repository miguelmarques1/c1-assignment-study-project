import path from "node:path";
import type { Readable } from "node:stream";
import { prisma } from "@/app/_lib/db";
import {
  ALLOWED_MIME_TYPES,
  containerFormatOf,
  extensionOf,
  resolveMaxVideoBytes,
} from "./constants";
import { VideoUploadError } from "./errors";
import { extractThumbnail, pickThumbnailTimestamp, probeDuration } from "./probe";
import {
  ensureVideoDir,
  moveToFinal,
  removeVideoDir,
  resolveVideoPaths,
  safeUnlink,
  writeTempStream,
} from "./storage";

export type VideoDTO = {
  id: string;
  title: string;
  description: string;
  originalFilename: string;
  sizeBytes: number;
  durationSeconds: number | null;
  containerFormat: string;
  status: string;
  thumbnailUrl: string;
  hasCustomThumbnail: boolean;
  createdAt: string;
};

export type UploadVideoInput = {
  userId: string;
  requestStream: Readable;
  declaredName: string;
  declaredSize: number;
  declaredMime?: string | null;
};

function titleFromFilename(filename: string): string {
  const base = path.basename(filename, path.extname(filename));
  const trimmed = base.trim();
  const safe = trimmed.length > 0 ? trimmed : "Untitled";
  return safe.slice(0, 200);
}

export async function uploadVideo(input: UploadVideoInput): Promise<VideoDTO> {
  const { userId, requestStream, declaredName, declaredSize, declaredMime } = input;

  if (!declaredName || declaredName.length === 0 || declaredName.length > 255) {
    throw new VideoUploadError("UPL_MISSING_NAME");
  }
  const ext = extensionOf(declaredName);
  if (!ext) {
    throw new VideoUploadError("UPL_BAD_EXTENSION");
  }
  if (
    declaredMime &&
    declaredMime !== "application/octet-stream" &&
    !(ALLOWED_MIME_TYPES as readonly string[]).includes(declaredMime)
  ) {
    throw new VideoUploadError("UPL_BAD_MIME");
  }
  if (!Number.isFinite(declaredSize) || declaredSize <= 0) {
    throw new VideoUploadError("UPL_MISSING_SIZE");
  }
  const maxBytes = resolveMaxVideoBytes();
  if (declaredSize > maxBytes) {
    throw new VideoUploadError("UPL_TOO_LARGE");
  }

  const containerFormat = containerFormatOf(declaredName);
  if (!containerFormat) {
    throw new VideoUploadError("UPL_BAD_EXTENSION");
  }

  // Create row first (inside a transaction with row rollback on any failure).
  const video = await prisma.video.create({
    data: {
      userId,
      title: titleFromFilename(declaredName),
      originalFilename: declaredName,
      sizeBytes: BigInt(declaredSize),
      containerFormat,
      storagePath: path.join(userId, "__pending__", `source.${containerFormat}`),
      status: "validating",
    },
  });

  const paths = resolveVideoPaths(userId, video.id, containerFormat);

  // Update with the real relative path now that we know the video id.
  await prisma.video.update({
    where: { id: video.id },
    data: { storagePath: paths.sourceRelative },
  });

  let bytesWritten = 0;
  try {
    await ensureVideoDir(paths.videoDir);
    bytesWritten = await writeTempStream(paths.temp, requestStream, maxBytes);
    if (bytesWritten === 0) {
      throw new VideoUploadError("UPL_EMPTY");
    }
    if (bytesWritten < declaredSize) {
      throw new VideoUploadError("UPL_INCOMPLETE");
    }
    await moveToFinal(paths.temp, paths.source);
  } catch (err) {
    await safeUnlink(paths.temp);
    await removeVideoDir(userId, video.id);
    await prisma.video.delete({ where: { id: video.id } }).catch(() => {});
    if (err instanceof VideoUploadError) throw err;
    throw new VideoUploadError("UPL_DISK_WRITE", (err as Error).message);
  }

  // Post-write probe + thumbnail (non-fatal).
  let durationSeconds: number | null = null;
  try {
    durationSeconds = await probeDuration(paths.source);
  } catch {
    durationSeconds = null;
  }

  let thumbnailSuccess = false;
  try {
    thumbnailSuccess = await extractThumbnail({
      source: paths.source,
      destination: paths.thumbnail,
      atSeconds: pickThumbnailTimestamp(durationSeconds),
    });
  } catch {
    thumbnailSuccess = false;
  }

  const updatedRow = await prisma.video.update({
    where: { id: video.id },
    data: {
      sizeBytes: BigInt(bytesWritten),
      durationSeconds: durationSeconds ?? null,
      thumbnailPath: thumbnailSuccess ? paths.thumbnailRelative : null,
    },
  });

  return toDTO(updatedRow);
}

type VideoRow = {
  id: string;
  title: string;
  description: string;
  originalFilename: string;
  sizeBytes: bigint;
  durationSeconds: unknown;
  containerFormat: string;
  status: string;
  thumbnailPath: string | null;
  createdAt: Date;
};

export function toDTO(row: VideoRow): VideoDTO {
  const duration =
    row.durationSeconds == null
      ? null
      : typeof row.durationSeconds === "number"
        ? row.durationSeconds
        : Number((row.durationSeconds as { toString(): string }).toString());

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    originalFilename: row.originalFilename,
    sizeBytes: Number(row.sizeBytes),
    durationSeconds: duration,
    containerFormat: row.containerFormat,
    status: row.status,
    thumbnailUrl: `/api/videos/${row.id}/thumbnail`,
    hasCustomThumbnail: row.thumbnailPath !== null,
    createdAt: row.createdAt.toISOString(),
  };
}
