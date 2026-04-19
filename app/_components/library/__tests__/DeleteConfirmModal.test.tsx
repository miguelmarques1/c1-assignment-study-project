import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/_lib/videos/actions", () => ({
  deleteVideo: vi.fn(),
}));

import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  DeleteConfirmModal,
  DELETE_LOCK_MS,
} from "../DeleteConfirmModal";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DeleteConfirmModal", () => {
  it("modal_shows_title_in_confirmation_copy", () => {
    render(
      <DeleteConfirmModal
        open={true}
        videoId="vid_1"
        videoTitle="My clip"
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      /Delete 'My clip'\?/,
    );
  });

  it("delete_button_is_disabled_for_1_second_after_open", () => {
    render(
      <DeleteConfirmModal
        open={true}
        videoId="vid_1"
        videoTitle="X"
        onClose={() => {}}
      />,
    );
    const button = screen.getByTestId("delete-confirm-button");
    expect(button).toBeDisabled();
    act(() => {
      vi.advanceTimersByTime(DELETE_LOCK_MS - 100);
    });
    expect(button).toBeDisabled();
  });

  it("delete_button_becomes_enabled_after_1_second", () => {
    render(
      <DeleteConfirmModal
        open={true}
        videoId="vid_1"
        videoTitle="X"
        onClose={() => {}}
      />,
    );
    const button = screen.getByTestId("delete-confirm-button");
    expect(button).toBeDisabled();
    act(() => {
      vi.advanceTimersByTime(DELETE_LOCK_MS + 50);
    });
    expect(button).not.toBeDisabled();
  });

  it("cancel_button_invokes_onClose", () => {
    const onClose = vi.fn();
    render(
      <DeleteConfirmModal
        open={true}
        videoId="vid_1"
        videoTitle="X"
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
