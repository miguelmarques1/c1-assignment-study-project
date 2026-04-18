import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/_lib/auth/logout", () => ({
  logout: vi.fn(),
}));

import { LogoutButton } from "../LogoutButton";

describe("LogoutButton", () => {
  it("renders_form_with_logout_action", () => {
    render(<LogoutButton />);
    const button = screen.getByRole("button", { name: /log out/i });
    expect(button).toBeInTheDocument();
    expect(button.closest("form")).not.toBeNull();
  });
});
