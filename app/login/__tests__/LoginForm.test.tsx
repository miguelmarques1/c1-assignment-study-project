import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { LoginState } from "@/app/_lib/auth/login";
import { LoginForm } from "../LoginForm";

describe("LoginForm", () => {
  it("renders_email_and_password_fields", () => {
    const action = vi.fn(
      async () => ({ ok: false }) satisfies LoginState,
    ) as unknown as Parameters<typeof LoginForm>[0]["action"];
    render(<LoginForm action={action} />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log in/i })).toBeInTheDocument();
  });

  it("renders_generic_error_at_top_of_form_when_action_returns_form_error", async () => {
    const action = vi.fn(
      async () =>
        ({
          ok: false,
          errors: { _form: ["Invalid email or password"] },
        }) satisfies LoginState,
    ) as unknown as Parameters<typeof LoginForm>[0]["action"];
    render(<LoginForm action={action} />);

    const form = screen.getByRole("button", { name: /log in/i })
      .closest("form")!;
    const { act } = await import("react");
    await act(async () => {
      form.requestSubmit();
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/invalid email or password/i);
  });
});
