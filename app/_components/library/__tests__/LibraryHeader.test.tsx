import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/_lib/videos/actions", () => ({
  setLibraryPreferences: vi.fn(),
  submitLibraryPreferences: vi.fn(),
}));

import { render, screen } from "@testing-library/react";
import { LibraryHeader } from "../LibraryHeader";

describe("LibraryHeader", () => {
  it("renders_view_toggle_with_current_active_state", () => {
    render(<LibraryHeader view="grid" sort="recent" />);
    expect(screen.getByTestId("view-toggle-grid")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("view-toggle-list")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("renders_sort_select_with_current_value", () => {
    render(<LibraryHeader view="list" sort="title_asc" />);
    expect(screen.getByTestId("library-sort")).toHaveValue("title_asc");
  });

  it("renders_all_three_sort_options", () => {
    render(<LibraryHeader view="grid" sort="recent" />);
    const select = screen.getByTestId("library-sort") as HTMLSelectElement;
    const values = Array.from(select.options).map((option) => option.value);
    expect(values).toEqual(["recent", "oldest", "title_asc"]);
  });
});
