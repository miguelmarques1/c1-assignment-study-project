import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "../EmptyState";

describe("EmptyState", () => {
  it("renders_illustration_and_copy", () => {
    render(<EmptyState />);
    expect(
      screen.getByText("Upload your first video to get started"),
    ).toBeInTheDocument();
    const img = document.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/empty-library.svg");
  });
});
