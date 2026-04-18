import type { VideoDTO } from "./upload";
import type { UploadErrorCode } from "./errors";

export type UploadProgressEvent = {
  loaded: number;
  total: number;
};

export type UploadVideoClientOptions = {
  file: File;
  onProgress?: (p: UploadProgressEvent) => void;
  signal?: AbortSignal;
};

export class UploadClientError extends Error {
  readonly code: UploadErrorCode;
  readonly status: number;
  constructor(code: UploadErrorCode, status: number, message?: string) {
    super(message ?? code);
    this.name = "UploadClientError";
    this.code = code;
    this.status = status;
  }
}

export function uploadVideoToServer(options: UploadVideoClientOptions): Promise<VideoDTO> {
  const { file, onProgress, signal } = options;

  return new Promise<VideoDTO>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `/api/videos?name=${encodeURIComponent(file.name)}&size=${file.size}`;
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (ev: ProgressEvent) => {
      if (ev.lengthComputable) {
        onProgress?.({ loaded: ev.loaded, total: ev.total });
      }
    };

    xhr.onload = () => {
      const status = xhr.status;
      if (status >= 200 && status < 300) {
        try {
          const body = JSON.parse(xhr.responseText) as VideoDTO;
          resolve(body);
        } catch {
          reject(new UploadClientError("UPL_DISK_WRITE", status, "Malformed server response"));
        }
        return;
      }
      let code: UploadErrorCode = "UPL_DISK_WRITE";
      let message = xhr.responseText;
      try {
        const parsed = JSON.parse(xhr.responseText) as { code?: UploadErrorCode; message?: string };
        if (parsed.code) code = parsed.code;
        if (parsed.message) message = parsed.message;
      } catch {}
      reject(new UploadClientError(code, status, message));
    };

    xhr.onerror = () => {
      reject(new UploadClientError("UPL_INCOMPLETE", 0, "Upload interrupted — retry"));
    };

    xhr.onabort = () => {
      const err = new Error("Aborted");
      err.name = "AbortError";
      reject(err);
    };

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    xhr.send(file);
  });
}
