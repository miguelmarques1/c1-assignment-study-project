import path from "node:path";

export const ALLOWED_EXTENSIONS = [".mp4", ".mov", ".mkv", ".webm", ".avi"] as const;

export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

export const ALLOWED_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-matroska",
  "video/webm",
  "video/x-msvideo",
] as const;

export const FILE_INPUT_ACCEPT = ALLOWED_EXTENSIONS.join(",");

const DEFAULT_MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

export function resolveMaxVideoBytes(): number {
  const raw = process.env.VIDEO_MAX_BYTES;
  if (!raw) return DEFAULT_MAX_VIDEO_BYTES;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_VIDEO_BYTES;
  return parsed;
}

export const MAX_VIDEO_BYTES = resolveMaxVideoBytes();

// Use resolveMaxVideoBytes() where a live re-read is required (tests).


export function resolveStorageRoot(): string {
  const raw = process.env.VIDEO_STORAGE_ROOT;
  const rel = raw && raw.trim().length > 0 ? raw : "storage/videos";
  return path.isAbsolute(rel) ? rel : path.resolve(process.cwd(), rel);
}

export function extensionOf(filename: string): string | null {
  const ext = path.extname(filename).toLowerCase();
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(ext) ? ext : null;
}

export function containerFormatOf(filename: string): string | null {
  const ext = extensionOf(filename);
  return ext ? ext.slice(1) : null;
}
