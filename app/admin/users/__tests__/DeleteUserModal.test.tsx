import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

vi.mock("@/app/_lib/admin/user-actions", () => ({
  deleteUser: vi.fn(),
}));

import { DeleteUserModal, DELETE_LOCKOUT_MS } from "../DeleteUserModal";

const USER = {
  id: "u1",
  email: "ada@example.com",
  name: "Ada",
  checksum: "false:1000",
};

describe("DeleteUserModal", () => {
  it("delete_button_is_disabled_until_email_matches", async () => {
    vi.useFakeTimers();
    try {
      render(
        <DeleteUserModal
          user={USER}
          onClose={() => {}}
          onDeleted={() => {}}
          deleteAction={vi.fn()}
        />,
      );
      const button = screen.getByRole("button", { name: /delete user/i });
      expect(button).toBeDisabled();

      const input = screen.getByLabelText(/type/i);
      fireEvent.change(input, { target: { value: "partial@" } });
      expect(button).toBeDisabled();

      fireEvent.change(input, { target: { value: "ada@example.com" } });
      expect(button).toBeDisabled(); // still within the 1s lockout

      act(() => {
        vi.advanceTimersByTime(DELETE_LOCKOUT_MS + 10);
      });
      expect(button).not.toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("delete_button_is_disabled_for_one_second_after_open", async () => {
    vi.useFakeTimers();
    try {
      render(
        <DeleteUserModal
          user={USER}
          onClose={() => {}}
          onDeleted={() => {}}
          deleteAction={vi.fn()}
        />,
      );
      const button = screen.getByRole("button", { name: /delete user/i });
      const input = screen.getByLabelText(/type/i);
      fireEvent.change(input, { target: { value: USER.email } });
      expect(button).toBeDisabled();

      act(() => {
        vi.advanceTimersByTime(DELETE_LOCKOUT_MS - 1);
      });
      expect(button).toBeDisabled();

      act(() => {
        vi.advanceTimersByTime(2);
      });
      expect(button).not.toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("match_is_case_insensitive", async () => {
    vi.useFakeTimers();
    try {
      render(
        <DeleteUserModal
          user={USER}
          onClose={() => {}}
          onDeleted={() => {}}
          deleteAction={vi.fn()}
        />,
      );
      const input = screen.getByLabelText(/type/i);
      fireEvent.change(input, { target: { value: "ADA@Example.COM" } });
      act(() => {
        vi.advanceTimersByTime(DELETE_LOCKOUT_MS + 10);
      });
      expect(screen.getByRole("button", { name: /delete user/i })).not.toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders_server_error_returned_by_action", async () => {
    const action = vi.fn(async () => ({
      ok: false as const,
      code: "ADMIN_DELETE_FAILED" as const,
      error: "Failed to delete user — please retry",
    }));
    render(
      <DeleteUserModal
        user={USER}
        onClose={() => {}}
        onDeleted={() => {}}
        deleteAction={action}
      />,
    );
    const input = screen.getByLabelText(/type/i);
    fireEvent.change(input, { target: { value: USER.email } });
    await new Promise((resolve) => setTimeout(resolve, DELETE_LOCKOUT_MS + 20));
    fireEvent.click(screen.getByRole("button", { name: /delete user/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/failed to delete/i),
    );
    expect(action).toHaveBeenCalled();
  });
});
