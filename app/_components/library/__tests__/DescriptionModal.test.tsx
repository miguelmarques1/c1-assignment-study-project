import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/_lib/videos/actions", () => ({
  editVideoDescription: vi.fn(),
}));

import { fireEvent, render, screen } from "@testing-library/react";
import { DescriptionModal } from "../DescriptionModal";

describe("DescriptionModal", () => {
  it("modal_does_not_render_when_closed", () => {
    render(
      <DescriptionModal
        open={false}
        videoId="vid_1"
        videoTitle="Hello"
        initialDescription=""
        onClose={() => {}}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("modal_renders_when_open_with_initial_description", () => {
    render(
      <DescriptionModal
        open={true}
        videoId="vid_1"
        videoTitle="Hello"
        initialDescription="Hi there"
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("Hi there");
  });

  it("textarea_shows_live_character_counter", () => {
    render(
      <DescriptionModal
        open={true}
        videoId="vid_1"
        videoTitle="Hello"
        initialDescription=""
        onClose={() => {}}
      />,
    );
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "x".repeat(500) } });
    expect(screen.getByTestId("description-counter").textContent).toBe(
      "500 / 2000",
    );
  });

  it("modal_closes_on_escape", () => {
    const onClose = vi.fn();
    render(
      <DescriptionModal
        open={true}
        videoId="vid_1"
        videoTitle="Hello"
        initialDescription=""
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("modal_closes_on_backdrop_click", () => {
    const onClose = vi.fn();
    render(
      <DescriptionModal
        open={true}
        videoId="vid_1"
        videoTitle="Hello"
        initialDescription=""
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalled();
  });
});
