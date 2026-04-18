import { describe, expect, it } from "vitest";
import { getSession } from "../session";

describe("getSession", () => {
  it("stub_returns_null_until_f02", async () => {
    await expect(getSession()).resolves.toBeNull();
  });
});
