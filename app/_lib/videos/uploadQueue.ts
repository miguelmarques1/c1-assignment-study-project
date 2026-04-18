import type { VideoDTO } from "./upload";
import type { UploadErrorCode } from "./errors";
import { UploadClientError, uploadVideoToServer } from "./uploadClient";

export type QueueItemStatus = "queued" | "uploading" | "done" | "failed" | "cancelled";

export type QueueItem = {
  id: string;
  file: File;
  filename: string;
  totalBytes: number;
  loadedBytes: number;
  status: QueueItemStatus;
  errorCode?: UploadErrorCode;
  errorMessage?: string;
  video?: VideoDTO;
};

type Listener = (snapshot: ReadonlyArray<QueueItem>) => void;

type RunOptions = {
  uploader?: (args: {
    file: File;
    onProgress: (p: { loaded: number; total: number }) => void;
    signal: AbortSignal;
  }) => Promise<VideoDTO>;
};

export class UploadQueue {
  private items: QueueItem[] = [];
  private listeners = new Set<Listener>();
  private currentController: AbortController | null = null;
  private currentId: string | null = null;
  private running = false;
  private readonly uploader: NonNullable<RunOptions["uploader"]>;

  constructor(options: RunOptions = {}) {
    this.uploader =
      options.uploader ??
      (({ file, onProgress, signal }) => uploadVideoToServer({ file, onProgress, signal }));
  }

  getSnapshot(): ReadonlyArray<QueueItem> {
    return this.items;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  enqueue(files: File[]): QueueItem[] {
    const added: QueueItem[] = [];
    for (const file of files) {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `u_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const item: QueueItem = {
        id,
        file,
        filename: file.name,
        totalBytes: file.size,
        loadedBytes: 0,
        status: "queued",
      };
      this.items = [...this.items, item];
      added.push(item);
    }
    this.emit();
    void this.runLoop();
    return added;
  }

  cancel(id: string): void {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    if (item.status === "queued") {
      this.updateItem(id, { status: "cancelled" });
      return;
    }
    if (item.status === "uploading" && this.currentId === id && this.currentController) {
      this.currentController.abort();
    }
  }

  retry(id: string): void {
    const item = this.items.find((i) => i.id === id);
    if (!item || item.status !== "failed") return;
    this.updateItem(id, { status: "queued", loadedBytes: 0, errorCode: undefined, errorMessage: undefined });
    void this.runLoop();
  }

  dismiss(id: string): void {
    this.items = this.items.filter((i) => i.id !== id);
    this.emit();
  }

  private updateItem(id: string, patch: Partial<QueueItem>): void {
    this.items = this.items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    this.emit();
  }

  private emit(): void {
    const snapshot = this.items;
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private async runLoop(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (true) {
        const next = this.items.find((i) => i.status === "queued");
        if (!next) break;
        await this.runOne(next);
      }
    } finally {
      this.running = false;
      this.currentController = null;
      this.currentId = null;
    }
  }

  private async runOne(item: QueueItem): Promise<void> {
    const controller = new AbortController();
    this.currentController = controller;
    this.currentId = item.id;
    this.updateItem(item.id, { status: "uploading", loadedBytes: 0 });
    try {
      const video = await this.uploader({
        file: item.file,
        onProgress: ({ loaded, total }) => {
          this.updateItem(item.id, { loadedBytes: loaded, totalBytes: total });
        },
        signal: controller.signal,
      });
      this.updateItem(item.id, {
        status: "done",
        loadedBytes: item.totalBytes,
        video,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        this.updateItem(item.id, { status: "cancelled" });
        return;
      }
      if (err instanceof UploadClientError) {
        this.updateItem(item.id, {
          status: "failed",
          errorCode: err.code,
          errorMessage: err.message,
        });
        return;
      }
      this.updateItem(item.id, {
        status: "failed",
        errorCode: "UPL_DISK_WRITE",
        errorMessage: (err as Error).message,
      });
    }
  }
}

let singleton: UploadQueue | null = null;

export function getUploadQueue(): UploadQueue {
  if (!singleton) singleton = new UploadQueue();
  return singleton;
}
