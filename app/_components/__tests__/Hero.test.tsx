import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Hero } from "../Hero";

describe("Hero", () => {
  it("renders_product_name_and_value_prop", () => {
    render(<Hero />);
    expect(
      screen.getByRole("heading", { level: 1, name: /searchable/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/VideoMax MBA uploads your personal videos/i)).toBeInTheDocument();
  });

  it("create_account_cta_points_to_register", () => {
    render(<Hero />);
    const cta = screen.getByRole("link", { name: /create account/i });
    expect(cta).toHaveAttribute("href", "/register");
  });

  it("cta_uses_accent_color_class", () => {
    render(<Hero />);
    const cta = screen.getByRole("link", { name: /create account/i });
    expect(cta.className).toMatch(/bg-accent/);
  });
});
