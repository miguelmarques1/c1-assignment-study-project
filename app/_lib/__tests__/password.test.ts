import { describe, expect, it } from "vitest";
import { DUMMY_HASH, hashPassword, verifyPassword } from "../password";

describe("password", () => {
  it("hash_produces_bcrypt_output", async () => {
    const hash = await hashPassword("abc12345");
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(hash.length).toBeGreaterThanOrEqual(60);
  });

  it("verify_true_on_matching_hash", async () => {
    const hash = await hashPassword("correct horse battery");
    await expect(verifyPassword("correct horse battery", hash)).resolves.toBe(
      true,
    );
  });

  it("verify_false_on_mismatching_hash", async () => {
    const hash = await hashPassword("correct horse battery");
    await expect(verifyPassword("wrong horse", hash)).resolves.toBe(false);
  });

  it("dummy_hash_is_valid_bcrypt", async () => {
    await expect(verifyPassword("anything", DUMMY_HASH)).resolves.toBe(false);
  });

  it("verify_runtime_matches_within_tolerance_for_hit_vs_miss", async () => {
    const real = await hashPassword("timing-check-pw1");

    const hitStart = Date.now();
    await verifyPassword("timing-check-pw1", real);
    const hitMs = Date.now() - hitStart;

    const missStart = Date.now();
    await verifyPassword("any-input", DUMMY_HASH);
    const missMs = Date.now() - missStart;

    const ratio = Math.max(hitMs, missMs) / Math.max(1, Math.min(hitMs, missMs));
    expect(ratio).toBeLessThan(3);
  }, 15_000);
});
