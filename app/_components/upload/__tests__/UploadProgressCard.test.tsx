import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { UploadProgressCard } from "../UploadProgressCard";
import type { QueueItem } from "@/app/_lib/videos/uploadQueue";

function item(patch: Partial<QueueItem> = {}): QueueItem {
  const base: QueueItem = {
    id: "i1",
    file: new File([new Uint8Array(1)], "video.mp4"),
    filename: "morning-standup.mp4",
    totalBytes: 1024 * 1024,
    loadedBytes: 0,
    status: "queued",
  };
  return { ...base, ...patch };
}

describe("UploadProgressCard", () => {
  it("progress_card_shows_filename_and_percentage_and_bytes", () => {
    render(<UploadProgressCard item={item({ status: "uploading", loadedBytes: 512 * 1024 })} />);
    expect(screen.getByText("morning-standup.mp4")).toBeInTheDocument();
    expect(screen.getByText(/50%/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  });

  it("progress_card_shows_cancel_button_while_uploading", () => {
    const onCancel = vi.fn();
    render(
      <UploadProgressCard
        item={item({ status: "uploading", loadedBytes: 10 })}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledWith("i1");
  });

  it("progress_card_shows_retry_button_on_failure", () => {
    const onRetry = vi.fn();
    render(
      <UploadProgressCard
        item={item({ status: "failed", errorCode: "UPL_INCOMPLETE" })}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText(/Upload interrupted/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledWith("i1");
  });

  it("progress_card_shows_done_state_after_success", () => {
    render(<UploadProgressCard item={item({ status: "done", loadedBytes: 1024 * 1024 })} />);
    expect(screen.getByText(/Done/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });
});
