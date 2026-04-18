import { describe, expect, it, vi } from "vitest";
import { UploadQueue } from "../uploadQueue";
import { UploadClientError } from "../uploadClient";

function mockFile(name: string, size = 100): File {
  const blob = new Blob([new Uint8Array(size)], { type: "application/octet-stream" });
  Object.defineProperty(blob, "size", { value: size });
  return new File([blob], name);
}

function videoDTO(id = "v1") {
  return {
    id,
    title: "t",
    description: "",
    originalFilename: "f.mp4",
    sizeBytes: 100,
    durationSeconds: null,
    containerFormat: "mp4",
    status: "validating",
    thumbnailUrl: `/api/videos/${id}/thumbnail`,
    hasCustomThumbnail: false,
    createdAt: new Date().toISOString(),
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("UploadQueue", () => {
  it("enqueue_runs_first_item_immediately", async () => {
    const uploader = vi.fn(async ({ onProgress }: { onProgress: (p: { loaded: number; total: number }) => void }) => {
      onProgress({ loaded: 50, total: 100 });
      return videoDTO("v1");
    });
    const q = new UploadQueue({ uploader });
    q.enqueue([mockFile("a.mp4")]);
    await flush();
    await flush();
    const items = q.getSnapshot();
    expect(items[0].status).toBe("done");
    expect(items[0].video?.id).toBe("v1");
  });

  it("enqueue_serializes_second_item", async () => {
    let release!: (dto: ReturnType<typeof videoDTO>) => void;
    const first = new Promise<ReturnType<typeof videoDTO>>((r) => {
      release = r;
    });
    const uploader = vi
      .fn()
      .mockImplementationOnce(async () => first)
      .mockImplementationOnce(async () => videoDTO("v2"));

    const q = new UploadQueue({ uploader });
    q.enqueue([mockFile("a.mp4"), mockFile("b.mp4")]);
    await flush();
    const snapshot = q.getSnapshot();
    expect(snapshot[0].status).toBe("uploading");
    expect(snapshot[1].status).toBe("queued");
    release(videoDTO("v1"));
    await flush();
    await flush();
    expect(q.getSnapshot()[1].status).not.toBe("queued");
  });

  it("cancel_in_flight_removes_item_and_advances_queue", async () => {
    const uploader = vi
      .fn()
      .mockImplementationOnce(async ({ signal }: { signal: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            const err = new Error("Aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      })
      .mockImplementationOnce(async () => videoDTO("v2"));

    const q = new UploadQueue({ uploader });
    const [first] = q.enqueue([mockFile("a.mp4"), mockFile("b.mp4")]);
    await flush();
    q.cancel(first.id);
    await flush();
    await flush();
    const items = q.getSnapshot();
    expect(items[0].status).toBe("cancelled");
    expect(items[1].status).toBe("done");
  });

  it("subscribe_emits_snapshot_on_every_state_change", async () => {
    const uploader = vi.fn(async () => videoDTO("v1"));
    const q = new UploadQueue({ uploader });
    const listener = vi.fn();
    q.subscribe(listener);
    q.enqueue([mockFile("a.mp4")]);
    await flush();
    await flush();
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("failed_item_can_be_retried", async () => {
    const uploader = vi
      .fn()
      .mockImplementationOnce(async () => {
        throw new UploadClientError("UPL_DISK_WRITE", 500);
      })
      .mockImplementationOnce(async () => videoDTO("v1"));

    const q = new UploadQueue({ uploader });
    const [item] = q.enqueue([mockFile("a.mp4")]);
    await flush();
    await flush();
    expect(q.getSnapshot()[0].status).toBe("failed");
    q.retry(item.id);
    await flush();
    await flush();
    expect(q.getSnapshot()[0].status).toBe("done");
  });
});
