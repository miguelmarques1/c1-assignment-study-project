import { describe, expect, it } from "vitest";
import { userActionChecksum } from "../checksum";

describe("userActionChecksum", () => {
  it("checksum_combines_suspended_and_updated_at", () => {
    expect(
      userActionChecksum({ isSuspended: false, updatedAt: new Date(1_000) }),
    ).toBe("false:1000");
    expect(
      userActionChecksum({ isSuspended: true, updatedAt: new Date(42) }),
    ).toBe("true:42");
  });

  it("checksum_changes_when_suspended_flips", () => {
    const before = userActionChecksum({
      isSuspended: false,
      updatedAt: new Date(1_000),
    });
    const after = userActionChecksum({
      isSuspended: true,
      updatedAt: new Date(1_000),
    });
    expect(before).not.toBe(after);
  });

  it("checksum_changes_when_updated_at_advances", () => {
    const before = userActionChecksum({
      isSuspended: false,
      updatedAt: new Date(1_000),
    });
    const after = userActionChecksum({
      isSuspended: false,
      updatedAt: new Date(2_000),
    });
    expect(before).not.toBe(after);
  });
});
