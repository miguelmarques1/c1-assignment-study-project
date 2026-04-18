import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UploadClientError, uploadVideoToServer } from "../uploadClient";

type ProgressHandler = (ev: { lengthComputable: boolean; loaded: number; total: number }) => void;

type MockXHR = {
  open: ReturnType<typeof vi.fn>;
  setRequestHeader: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  upload: { onprogress: ProgressHandler | null };
  onload: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  status: number;
  responseText: string;
};

let current: MockXHR;
let originalXHR: typeof globalThis.XMLHttpRequest | undefined;

function makeMock(): MockXHR {
  return {
    open: vi.fn(),
    setRequestHeader: vi.fn(),
    send: vi.fn(),
    abort: vi.fn(),
    upload: { onprogress: null },
    onload: null,
    onerror: null,
    onabort: null,
    status: 0,
    responseText: "",
  };
}

beforeEach(() => {
  current = makeMock();
  originalXHR = globalThis.XMLHttpRequest;
  function FakeXHR(this: MockXHR) {
    Object.assign(this, current);
    current = this as unknown as MockXHR;
  }
  (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest =
    FakeXHR as unknown as typeof globalThis.XMLHttpRequest;
});

afterEach(() => {
  if (originalXHR) {
    (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = originalXHR;
  }
  vi.restoreAllMocks();
});

function mockFile(name = "a.mp4", size = 100): File {
  const file = new File([new Uint8Array(1)], name, { type: "video/mp4" });
  Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

describe("uploadVideoToServer", () => {
  it("upload_client_emits_progress_events", async () => {
    const onProgress = vi.fn();
    const p = uploadVideoToServer({ file: mockFile(), onProgress });
    current.upload.onprogress!({ lengthComputable: true, loaded: 40, total: 100 });
    current.upload.onprogress!({ lengthComputable: true, loaded: 80, total: 100 });
    current.status = 201;
    current.responseText = JSON.stringify({ id: "v1" });
    current.onload!();
    await p;
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith({ loaded: 80, total: 100 });
  });

  it("upload_client_resolves_with_video_dto_on_201", async () => {
    const p = uploadVideoToServer({ file: mockFile() });
    current.status = 201;
    current.responseText = JSON.stringify({ id: "v9", title: "t" });
    current.onload!();
    await expect(p).resolves.toMatchObject({ id: "v9" });
  });

  it("upload_client_rejects_with_typed_error_on_400_UPL_BAD_EXTENSION", async () => {
    const p = uploadVideoToServer({ file: mockFile("a.mpg") });
    current.status = 400;
    current.responseText = JSON.stringify({ code: "UPL_BAD_EXTENSION", message: "x" });
    current.onload!();
    await expect(p).rejects.toMatchObject({ code: "UPL_BAD_EXTENSION" });
  });

  it("upload_client_rejects_with_UPL_INCOMPLETE_on_connection_loss", async () => {
    const p = uploadVideoToServer({ file: mockFile() });
    current.onerror!();
    await expect(p).rejects.toBeInstanceOf(UploadClientError);
    await p.catch((err) => expect(err.code).toBe("UPL_INCOMPLETE"));
  });

  it("upload_client_aborts_when_abort_signal_fires", async () => {
    const controller = new AbortController();
    const p = uploadVideoToServer({ file: mockFile(), signal: controller.signal });
    const abortSpy = current.abort;
    controller.abort();
    current.onabort!();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    expect(abortSpy).toHaveBeenCalled();
  });
});
