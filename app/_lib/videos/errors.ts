export const UPLOAD_ERROR_CODES = [
  "UPL_UNAUTHORIZED",
  "UPL_BAD_EXTENSION",
  "UPL_BAD_MIME",
  "UPL_MISSING_NAME",
  "UPL_MISSING_SIZE",
  "UPL_SIZE_MISMATCH",
  "UPL_TOO_LARGE",
  "UPL_INCOMPLETE",
  "UPL_DISK_WRITE",
  "UPL_PATH_TRAVERSAL",
  "UPL_EMPTY",
] as const;

export type UploadErrorCode = (typeof UPLOAD_ERROR_CODES)[number];

export class VideoUploadError extends Error {
  readonly code: UploadErrorCode;

  constructor(code: UploadErrorCode, message?: string) {
    super(message ?? code);
    this.name = "VideoUploadError";
    this.code = code;
  }
}

export function uploadErrorToHttpStatus(code: UploadErrorCode): number {
  switch (code) {
    case "UPL_UNAUTHORIZED":
      return 401;
    case "UPL_TOO_LARGE":
      return 413;
    case "UPL_DISK_WRITE":
      return 500;
    case "UPL_BAD_EXTENSION":
    case "UPL_BAD_MIME":
    case "UPL_MISSING_NAME":
    case "UPL_MISSING_SIZE":
    case "UPL_SIZE_MISMATCH":
    case "UPL_INCOMPLETE":
    case "UPL_PATH_TRAVERSAL":
    case "UPL_EMPTY":
      return 400;
  }
}

const MESSAGES: Record<UploadErrorCode, string> = {
  UPL_UNAUTHORIZED: "Not authenticated",
  UPL_BAD_EXTENSION: "Only MP4, MOV, MKV, WEBM, and AVI files are supported",
  UPL_BAD_MIME: "Only MP4, MOV, MKV, WEBM, and AVI files are supported",
  UPL_MISSING_NAME: "Missing filename",
  UPL_MISSING_SIZE: "Missing or invalid size",
  UPL_SIZE_MISMATCH: "Declared size does not match request body",
  UPL_TOO_LARGE: "Files must be at most 2GB",
  UPL_INCOMPLETE: "Upload interrupted — retry",
  UPL_DISK_WRITE: "Upload failed — please try again",
  UPL_PATH_TRAVERSAL: "Invalid filename",
  UPL_EMPTY: "File is empty",
};

export function uploadErrorMessage(code: UploadErrorCode): string {
  return MESSAGES[code];
}
