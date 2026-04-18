import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HowItWorksStrip } from "../HowItWorksStrip";

describe("HowItWorksStrip", () => {
  it("renders_three_steps_in_order", () => {
    render(<HowItWorksStrip />);
    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual(["Upload", "Transcribe", "Summarize"]);
  });
});
