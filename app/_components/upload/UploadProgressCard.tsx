"use client";

import type { QueueItem } from "@/app/_lib/videos/uploadQueue";

type Props = {
  item: QueueItem;
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
  onDismiss?: (id: string) => void;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let size = n / 1024;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(size < 10 ? 2 : 1)} ${units[i]}`;
}

function statusLabel(status: QueueItem["status"]): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "uploading":
      return "Uploading";
    case "done":
      return "Done";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
  }
}

function errorCopy(item: QueueItem): string {
  if (item.errorCode === "UPL_INCOMPLETE") return "Upload interrupted — retry";
  if (item.errorCode === "UPL_TOO_LARGE") return "Files must be at most 2GB";
  if (item.errorCode === "UPL_BAD_EXTENSION")
    return "Only MP4, MOV, MKV, WEBM, and AVI files are supported";
  if (item.errorCode === "UPL_DISK_WRITE") return "Upload failed — please try again";
  return item.errorMessage ?? "Upload failed — please try again";
}

export function UploadProgressCard({ item, onCancel, onRetry, onDismiss }: Props) {
  const pct =
    item.totalBytes > 0
      ? Math.min(100, Math.round((item.loadedBytes / item.totalBytes) * 100))
      : 0;

  return (
    <div className="rounded-md border border-border bg-white p-3 text-sm shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground" title={item.filename}>
            {item.filename}
          </p>
          <p className="text-xs text-muted">
            {statusLabel(item.status)}
            {item.status === "uploading" && (
              <>
                {" · "}
                {pct}%
                {" · "}
                {formatBytes(item.loadedBytes)} / {formatBytes(item.totalBytes)}
              </>
            )}
            {item.status === "queued" && <> · {formatBytes(item.totalBytes)}</>}
            {item.status === "done" && <> · {formatBytes(item.totalBytes)}</>}
          </p>
        </div>
        <div className="flex gap-2">
          {item.status === "uploading" && onCancel && (
            <button
              type="button"
              onClick={() => onCancel(item.id)}
              className="rounded border border-border px-2 py-1 text-xs hover:bg-gray-50"
            >
              Cancel
            </button>
          )}
          {item.status === "failed" && onRetry && (
            <button
              type="button"
              onClick={() => onRetry(item.id)}
              className="rounded border border-border px-2 py-1 text-xs hover:bg-gray-50"
            >
              Retry
            </button>
          )}
          {(item.status === "done" ||
            item.status === "failed" ||
            item.status === "cancelled") &&
            onDismiss && (
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => onDismiss(item.id)}
                className="rounded border border-border px-2 py-1 text-xs hover:bg-gray-50"
              >
                ×
              </button>
            )}
        </div>
      </div>
      {item.status === "uploading" && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-gray-100">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      )}
      {item.status === "failed" && (
        <p className="mt-2 text-xs text-red-700">{errorCopy(item)}</p>
      )}
    </div>
  );
}
