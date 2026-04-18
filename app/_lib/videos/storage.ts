import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { resolveStorageRoot } from "./constants";
import { VideoUploadError } from "./errors";

export type VideoPaths = {
  root: string;
  userDir: string;
  videoDir: string;
  source: string;
  sourceRelative: string;
  thumbnail: string;
  thumbnailRelative: string;
  temp: string;
};

const ID_PATTERN = /^[a-z0-9_-]+$/i;

function assertSafeId(segment: string, label: string): void {
  if (!segment || !ID_PATTERN.test(segment) || segment.includes("..")) {
    throw new VideoUploadError("UPL_PATH_TRAVERSAL", `Invalid ${label}`);
  }
}

export function resolveVideoPaths(
  userId: string,
  videoId: string,
  extensionWithoutDot: string,
): VideoPaths {
  assertSafeId(userId, "user id");
  assertSafeId(videoId, "video id");
  const extClean = extensionWithoutDot.toLowerCase().replace(/^\.+/, "");
  assertSafeId(extClean, "extension");

  const root = resolveStorageRoot();
  const userDir = path.join(root, userId);
  const videoDir = path.join(userDir, videoId);
  const sourceRelative = path.join(userId, videoId, `source.${extClean}`);
  const thumbnailRelative = path.join(userId, videoId, "thumbnail.jpg");
  const source = path.join(root, sourceRelative);
  const thumbnail = path.join(root, thumbnailRelative);
  const temp = path.join(videoDir, `source.${extClean}.part`);

  for (const p of [userDir, videoDir, source, thumbnail, temp]) {
    if (!path.resolve(p).startsWith(path.resolve(root))) {
      throw new VideoUploadError("UPL_PATH_TRAVERSAL", "Path escapes storage root");
    }
  }

  return {
    root,
    userDir,
    videoDir,
    source,
    sourceRelative,
    thumbnail,
    thumbnailRelative,
    temp,
  };
}

export async function ensureUserDir(userId: string): Promise<string> {
  assertSafeId(userId, "user id");
  const dir = path.join(resolveStorageRoot(), userId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function ensureVideoDir(videoDir: string): Promise<void> {
  await mkdir(videoDir, { recursive: true });
}

export async function writeTempStream(
  tempPath: string,
  source: Readable,
  maxBytes: number,
): Promise<number> {
  await mkdir(path.dirname(tempPath), { recursive: true });
  const out = createWriteStream(tempPath);
  let written = 0;
  let overflow = false;

  source.on("data", (chunk: Buffer) => {
    written += chunk.length;
    if (written > maxBytes && !overflow) {
      overflow = true;
      source.destroy(new VideoUploadError("UPL_TOO_LARGE"));
    }
  });

  try {
    await pipeline(source, out);
  } catch (err) {
    await safeUnlink(tempPath);
    if (err instanceof VideoUploadError) throw err;
    if (overflow) throw new VideoUploadError("UPL_TOO_LARGE");
    throw err;
  }
  return written;
}

export async function moveToFinal(tempPath: string, finalPath: string): Promise<void> {
  await mkdir(path.dirname(finalPath), { recursive: true });
  await rename(tempPath, finalPath);
}

export async function removeVideoDir(userId: string, videoId: string): Promise<void> {
  assertSafeId(userId, "user id");
  assertSafeId(videoId, "video id");
  const dir = path.join(resolveStorageRoot(), userId, videoId);
  if (!path.resolve(dir).startsWith(path.resolve(resolveStorageRoot()))) return;
  await rm(dir, { recursive: true, force: true });
}

export async function safeUnlink(p: string): Promise<void> {
  try {
    await unlink(p);
  } catch {}
}

export async function readThumbnailStream(
  relativeOrAbsolute: string,
): Promise<{ stream: Readable; size: number } | null> {
  const abs = path.isAbsolute(relativeOrAbsolute)
    ? relativeOrAbsolute
    : path.join(resolveStorageRoot(), relativeOrAbsolute);
  if (!path.resolve(abs).startsWith(path.resolve(resolveStorageRoot()))) {
    return null;
  }
  try {
    const info = await stat(abs);
    return { stream: createReadStream(abs), size: info.size };
  } catch {
    return null;
  }
}
