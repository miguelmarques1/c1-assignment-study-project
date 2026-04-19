import { describe, it, expect } from "vitest";
import { computeNextRunAt } from "../backoff";

describe("computeNextRunAt", () => {
  it("backoff_attempt_zero_is_immediate", () => {
    const now = new Date("2026-04-19T10:00:00Z");
    const next = computeNextRunAt(0, now);
    expect(next).toEqual(now);
  });

  it("backoff_first_attempt_schedules_plus_1m", () => {
    const now = new Date("2026-04-19T10:00:00Z");
    const next = computeNextRunAt(1, now);
    expect(next).not.toBeNull();
    expect(next!.getTime() - now.getTime()).toBe(60_000);
  });

  it("backoff_second_attempt_schedules_plus_5m", () => {
    const now = new Date("2026-04-19T10:00:00Z");
    const next = computeNextRunAt(2, now);
    expect(next).not.toBeNull();
    expect(next!.getTime() - now.getTime()).toBe(5 * 60_000);
  });

  it("backoff_third_attempt_returns_null", () => {
    expect(computeNextRunAt(3)).toBeNull();
  });

  it("backoff_beyond_third_attempt_returns_null", () => {
    expect(computeNextRunAt(10)).toBeNull();
  });
});
