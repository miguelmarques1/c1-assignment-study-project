import { ALLOWED_EXTENSIONS, FILE_INPUT_ACCEPT, MAX_VIDEO_BYTES } from "./constants";

export { ALLOWED_EXTENSIONS, FILE_INPUT_ACCEPT, MAX_VIDEO_BYTES };

export type ClientValidationReason = "UPL_BAD_EXTENSION" | "UPL_TOO_LARGE" | "UPL_EMPTY";

export type ClientValidationResult =
  | { ok: true }
  | { ok: false; reason: ClientValidationReason };

export function extensionFromName(name: string): string | null {
  const idx = name.lastIndexOf(".");
  if (idx < 0) return null;
  const ext = name.slice(idx).toLowerCase();
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(ext) ? ext : null;
}

export function validateClientFile(file: File): ClientValidationResult {
  if (!extensionFromName(file.name)) {
    return { ok: false, reason: "UPL_BAD_EXTENSION" };
  }
  if (file.size <= 0) {
    return { ok: false, reason: "UPL_TOO_LARGE" };
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return { ok: false, reason: "UPL_TOO_LARGE" };
  }
  return { ok: true };
}

export function reasonMessage(reason: ClientValidationReason): string {
  switch (reason) {
    case "UPL_BAD_EXTENSION":
      return "Only MP4, MOV, MKV, WEBM, and AVI files are supported";
    case "UPL_TOO_LARGE":
      return "Files must be at most 2GB";
    case "UPL_EMPTY":
      return "File is empty";
  }
}
