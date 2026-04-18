import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const enqueueSpy = vi.fn();

vi.mock("../useUploadQueue", () => ({
  useUploadQueue: () => ({
    items: [],
    enqueue: enqueueSpy,
    cancel: vi.fn(),
    retry: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

import { UploadDropZone } from "../UploadDropZone";
import { MAX_VIDEO_BYTES } from "@/app/_lib/videos/constants";

function makeFile(name: string, size: number, type = "video/mp4"): File {
  const file = new File([new Uint8Array(Math.min(size, 16))], name, { type });
  Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

beforeEach(() => {
  enqueueSpy.mockReset();
});

describe("UploadDropZone", () => {
  it("drop_zone_renders_with_upload_button_and_drop_area", () => {
    render(<UploadDropZone />);
    expect(screen.getByRole("button", { name: /drop videos here/i })).toBeInTheDocument();
    expect(screen.getByText(/upload video/i)).toBeInTheDocument();
  });

  it("drop_zone_enqueues_valid_file_on_drop", () => {
    render(<UploadDropZone />);
    const zone = screen.getByRole("button", { name: /drop videos here/i });
    const file = makeFile("a.mp4", 2048);
    fireEvent.drop(zone, {
      dataTransfer: {
        files: [file],
        items: [],
        types: ["Files"],
      },
    });
    expect(enqueueSpy).toHaveBeenCalledWith([file]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("drop_zone_rejects_bad_extension_with_inline_toast", () => {
    render(<UploadDropZone />);
    const zone = screen.getByRole("button", { name: /drop videos here/i });
    const file = makeFile("bad.mpg", 1024);
    fireEvent.drop(zone, {
      dataTransfer: {
        files: [file],
        items: [],
        types: ["Files"],
      },
    });
    expect(enqueueSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/MP4, MOV, MKV, WEBM, and AVI/i);
  });

  it("drop_zone_rejects_oversized_file_with_inline_toast", () => {
    render(<UploadDropZone />);
    const zone = screen.getByRole("button", { name: /drop videos here/i });
    const file = makeFile("a.mp4", MAX_VIDEO_BYTES + 1);
    fireEvent.drop(zone, {
      dataTransfer: {
        files: [file],
        items: [],
        types: ["Files"],
      },
    });
    expect(enqueueSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/at most 2GB/i);
  });

  it("file_picker_input_accepts_only_allowed_extensions", () => {
    const { container } = render(<UploadDropZone />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe(".mp4,.mov,.mkv,.webm,.avi");
  });
});
