import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/app/_lib/session", () => ({
  getSession: vi.fn(),
}));

import { redirect } from "next/navigation";
import { getSession } from "@/app/_lib/session";
import LandingPage from "../page";

const mockedRedirect = vi.mocked(redirect);
const mockedGetSession = vi.mocked(getSession);

describe("LandingPage (/)", () => {
  beforeEach(() => {
    mockedRedirect.mockClear();
    mockedGetSession.mockReset();
  });

  it("unauthenticated_visitor_sees_landing_sections", async () => {
    mockedGetSession.mockResolvedValue(null);
    const ui = await LandingPage();
    render(ui);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: /searchable/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  it("authenticated_visitor_is_redirected_to_app", async () => {
    mockedGetSession.mockResolvedValue({
      user: {
        id: "u1",
        email: "a@b.co",
        name: "Ada",
        isAdmin: false,
      },
    });
    await expect(LandingPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockedRedirect).toHaveBeenCalledWith("/app");
  });

  it("page_loads_without_auth_requirement", async () => {
    mockedGetSession.mockResolvedValue(null);
    await expect(LandingPage()).resolves.toBeTruthy();
    expect(mockedRedirect).not.toHaveBeenCalled();
  });
});
