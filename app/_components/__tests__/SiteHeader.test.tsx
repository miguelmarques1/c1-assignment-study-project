import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SiteHeader } from "../SiteHeader";

describe("SiteHeader", () => {
  it("renders_product_wordmark", () => {
    render(<SiteHeader />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByText(/videomax/i)).toBeInTheDocument();
  });

  it("login_link_points_to_login_route", () => {
    render(<SiteHeader />);
    const link = screen.getByRole("link", { name: /log in/i });
    expect(link).toHaveAttribute("href", "/login");
  });

  it("login_link_has_visible_focus_ring", () => {
    render(<SiteHeader />);
    const link = screen.getByRole("link", { name: /log in/i });
    expect(link.className).toMatch(/focus-visible:ring/);
  });
});
