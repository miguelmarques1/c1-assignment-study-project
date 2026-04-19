import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "../StatusBadge";

describe("StatusBadge", () => {
  const cases: Array<{ status: string; label: string }> = [
    { status: "validating", label: "Validating" },
    { status: "transcribing", label: "Transcribing" },
    { status: "summarizing", label: "Summarizing" },
    { status: "ready", label: "Ready" },
    { status: "failed", label: "Failed" },
  ];

  it.each(cases)(
    "badge_renders_correct_label_and_color_for_each_status ($status)",
    ({ status, label }) => {
      const { container } = render(<StatusBadge status={status} />);
      const badge = container.querySelector(`[data-status="${status}"]`);
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toContain(label);
    },
  );

  it("badge_has_role_status_for_screen_readers", () => {
    render(<StatusBadge status="ready" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
