import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const setSpy = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    set: setSpy,
    get: vi.fn(() => undefined),
  })),
}));

import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  setSessionCookie,
} from "../cookies";

describe("cookies", () => {
  beforeEach(() => {
    setSpy.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("cookie_name_is_videomax_session", () => {
    expect(SESSION_COOKIE_NAME).toBe("videomax_session");
  });

  it("cookie_is_httponly_and_samesite_lax", async () => {
    await setSessionCookie("abc");
    const opts = setSpy.mock.calls[0]![2];
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
  });

  it("set_cookie_uses_secure_in_production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await setSessionCookie("abc");
    const opts = setSpy.mock.calls[0]![2];
    expect(opts.secure).toBe(true);
  });

  it("set_cookie_omits_secure_in_development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await setSessionCookie("abc");
    const opts = setSpy.mock.calls[0]![2];
    expect(opts.secure).toBe(false);
  });

  it("clear_cookie_sets_max_age_zero", async () => {
    await clearSessionCookie();
    const opts = setSpy.mock.calls[0]![2];
    expect(opts.maxAge).toBe(0);
  });
});
