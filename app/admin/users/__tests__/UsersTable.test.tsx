import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/app/_lib/admin/user-actions", () => ({
  suspendUser: vi.fn(),
  reactivateUser: vi.fn(),
  deleteUser: vi.fn(),
  suspendUserAction: vi.fn(),
  reactivateUserAction: vi.fn(),
  deleteUserAction: vi.fn(),
}));

import { UsersTable } from "../UsersTable";
import type { AdminUserRow } from "@/app/_lib/admin/users-query";

function row(overrides: Partial<AdminUserRow> = {}): AdminUserRow {
  return {
    id: "u1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    lastLoginAt: new Date("2026-04-01T00:00:00Z"),
    isAdmin: false,
    isSuspended: false,
    videoCount: 3,
    checksum: "false:1000",
    ...overrides,
  };
}

describe("UsersTable", () => {
  it("renders_rows_with_expected_columns", () => {
    render(
      <UsersTable
        rows={[row()]}
        sort="createdAt"
        direction="desc"
        baseQuery={{ sort: "createdAt", dir: "desc" }}
        currentAdminId="admin-id"
      />,
    );
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("column_headers_toggle_sort_direction_in_query_params", () => {
    render(
      <UsersTable
        rows={[row()]}
        sort="email"
        direction="asc"
        baseQuery={{ sort: "email", dir: "asc" }}
        currentAdminId="admin-id"
      />,
    );
    const emailHeader = screen.getByRole("link", { name: /email/i });
    expect(emailHeader.getAttribute("href")).toContain("dir=desc");
    expect(emailHeader.getAttribute("href")).toContain("sort=email");

    const nameHeader = screen.getByRole("link", { name: /name/i });
    expect(nameHeader.getAttribute("href")).toContain("sort=name");
    expect(nameHeader.getAttribute("href")).toContain("dir=asc");
  });

  it("self_row_has_disabled_suspend_and_delete_buttons", () => {
    render(
      <UsersTable
        rows={[row({ id: "admin-id" })]}
        sort="createdAt"
        direction="desc"
        baseQuery={{ sort: "createdAt", dir: "desc" }}
        currentAdminId="admin-id"
      />,
    );
    const suspend = screen.getByRole("button", { name: "Suspend" });
    const del = screen.getByRole("button", { name: "Delete" });
    expect(suspend).toBeDisabled();
    expect(del).toBeDisabled();
    expect(suspend.getAttribute("title")).toMatch(/cannot suspend or delete/i);
  });

  it("status_badge_reads_active_or_suspended", () => {
    const { rerender } = render(
      <UsersTable
        rows={[row({ isSuspended: false })]}
        sort="createdAt"
        direction="desc"
        baseQuery={{ sort: "createdAt", dir: "desc" }}
        currentAdminId="admin-id"
      />,
    );
    expect(screen.getByText("Active")).toBeInTheDocument();
    rerender(
      <UsersTable
        rows={[row({ isSuspended: true })]}
        sort="createdAt"
        direction="desc"
        baseQuery={{ sort: "createdAt", dir: "desc" }}
        currentAdminId="admin-id"
      />,
    );
    expect(screen.getByText("Suspended")).toBeInTheDocument();
  });
});
