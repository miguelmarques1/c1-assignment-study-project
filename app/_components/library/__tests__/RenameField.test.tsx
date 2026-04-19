import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/_lib/videos/actions", () => ({
  renameVideo: vi.fn(),
}));

import { fireEvent, render, screen } from "@testing-library/react";
import { renameVideo } from "@/app/_lib/videos/actions";
import { RenameField } from "../RenameField";

describe("RenameField", () => {
  it("field_shows_static_title_when_not_editing", () => {
    render(
      <RenameField
        videoId="vid_1"
        initialTitle="Hello"
        isEditing={false}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("field_enters_edit_mode_with_input_focused", () => {
    render(
      <RenameField
        videoId="vid_1"
        initialTitle="Hello"
        isEditing={true}
        onClose={() => {}}
      />,
    );
    expect(
      screen.getByRole("textbox", { name: "Video title" }),
    ).toHaveValue("Hello");
  });

  it("field_rejects_empty_submission_inline", () => {
    const renameMock = vi.mocked(renameVideo);
    renameMock.mockClear();
    render(
      <RenameField
        videoId="vid_1"
        initialTitle="Hello"
        isEditing={true}
        onClose={() => {}}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Video title" });
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/title cannot be empty/i);
    expect(renameMock).not.toHaveBeenCalled();
  });

  it("field_cancels_on_escape", () => {
    const onClose = vi.fn();
    render(
      <RenameField
        videoId="vid_1"
        initialTitle="Hello"
        isEditing={true}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Video title" }), {
      key: "Escape",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("field_cancels_on_cancel_button", () => {
    const onClose = vi.fn();
    render(
      <RenameField
        videoId="vid_1"
        initialTitle="Hello"
        isEditing={true}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
