import type { VideoStatus } from "./status";
import type { LibrarySort } from "./libraryValidation";
import { listByUser } from "./libraryRepository";

export type VideoListItemDTO = {
  id: string;
  title: string;
  description: string;
  originalFilename: string;
  sizeBytes: number;
  durationSeconds: number | null;
  containerFormat: string;
  status: VideoStatus | string;
  thumbnailUrl: string;
  hasCustomThumbnail: boolean;
  createdAt: string;
};

type VideoRowLike = {
  id: string;
  title: string;
  description: string;
  originalFilename: string;
  sizeBytes: bigint | number;
  durationSeconds: unknown;
  containerFormat: string;
  status: string;
  thumbnailPath: string | null;
  createdAt: Date;
};

export function toVideoListItemDTO(row: VideoRowLike): VideoListItemDTO {
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
    sizeBytes: typeof row.sizeBytes === "bigint" ? Number(row.sizeBytes) : row.sizeBytes,
    durationSeconds: duration,
    containerFormat: row.containerFormat,
    status: row.status,
    thumbnailUrl: `/api/videos/${row.id}/thumbnail`,
    hasCustomThumbnail: row.thumbnailPath !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listVideosForUser(
  userId: string,
  sort: LibrarySort,
): Promise<VideoListItemDTO[]> {
  const rows = await listByUser(userId, sort);
  return rows.map(toVideoListItemDTO);
}
