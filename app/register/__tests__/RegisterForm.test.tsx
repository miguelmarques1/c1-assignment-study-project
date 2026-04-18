import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { RegisterState } from "@/app/_lib/auth/register";
import { RegisterForm } from "../RegisterForm";

describe("RegisterForm", () => {
  it("renders_all_four_fields", () => {
    const action = vi.fn(
      async () => ({ ok: false }) satisfies RegisterState,
    ) as unknown as Parameters<typeof RegisterForm>[0]["action"];
    render(<RegisterForm action={action} />);
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });

  it("renders_inline_error_under_password_when_action_returns_password_error", async () => {
    const action = vi.fn(
      async () =>
        ({
          ok: false,
          errors: { password: ["Password must contain at least one number"] },
        }) satisfies RegisterState,
    ) as unknown as Parameters<typeof RegisterForm>[0]["action"];
    render(<RegisterForm action={action} />);

    const form = screen.getByRole("button", { name: /create account/i })
      .closest("form")!;
    const { act } = await import("react");
    await act(async () => {
      form.requestSubmit();
    });

    expect(
      await screen.findByText(/at least one number/i),
    ).toBeInTheDocument();
  });

  it("submit_button_uses_orange_accent", () => {
    const action = vi.fn(
      async () => ({ ok: false }) satisfies RegisterState,
    ) as unknown as Parameters<typeof RegisterForm>[0]["action"];
    render(<RegisterForm action={action} />);
    const button = screen.getByRole("button", { name: /create account/i });
    expect(button.className).toMatch(/bg-accent/);
  });
});
