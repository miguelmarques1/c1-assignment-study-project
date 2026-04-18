import { describe, expect, it } from "vitest";
import { formatZodErrors, loginSchema, registerSchema } from "../validation";

const validRegister = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  password: "analytical1",
  passwordConfirmation: "analytical1",
};

describe("registerSchema", () => {
  it("register_accepts_valid_payload", () => {
    const parsed = registerSchema.safeParse(validRegister);
    expect(parsed.success).toBe(true);
  });

  it("register_rejects_empty_name", () => {
    const parsed = registerSchema.safeParse({ ...validRegister, name: "  " });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const fields = formatZodErrors(parsed.error);
      expect(fields.name?.join(" ")).toMatch(/required/i);
    }
  });

  it("register_rejects_invalid_email", () => {
    const parsed = registerSchema.safeParse({
      ...validRegister,
      email: "not-an-email",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const fields = formatZodErrors(parsed.error);
      expect(fields.email?.join(" ")).toMatch(/valid email/i);
    }
  });

  it("register_rejects_short_password", () => {
    const parsed = registerSchema.safeParse({
      ...validRegister,
      password: "ab1",
      passwordConfirmation: "ab1",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const fields = formatZodErrors(parsed.error);
      expect(fields.password?.join(" ")).toMatch(/at least 8 characters/i);
    }
  });

  it("register_rejects_password_missing_letter", () => {
    const parsed = registerSchema.safeParse({
      ...validRegister,
      password: "12345678",
      passwordConfirmation: "12345678",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const fields = formatZodErrors(parsed.error);
      expect(fields.password?.join(" ")).toMatch(/at least one letter/i);
    }
  });

  it("register_rejects_password_missing_number", () => {
    const parsed = registerSchema.safeParse({
      ...validRegister,
      password: "abcdefgh",
      passwordConfirmation: "abcdefgh",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const fields = formatZodErrors(parsed.error);
      expect(fields.password?.join(" ")).toMatch(/at least one number/i);
    }
  });

  it("register_rejects_password_confirmation_mismatch", () => {
    const parsed = registerSchema.safeParse({
      ...validRegister,
      passwordConfirmation: "different1",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const fields = formatZodErrors(parsed.error);
      expect(fields.passwordConfirmation?.join(" ")).toMatch(/do not match/i);
    }
  });
});

describe("loginSchema", () => {
  it("login_accepts_valid_payload", () => {
    const parsed = loginSchema.safeParse({
      email: "a@b.co",
      password: "x",
    });
    expect(parsed.success).toBe(true);
  });

  it("login_rejects_missing_fields", () => {
    const parsed = loginSchema.safeParse({ email: "", password: "" });
    expect(parsed.success).toBe(false);
  });
});

describe("formatZodErrors", () => {
  it("format_zod_errors_returns_field_map", () => {
    const parsed = registerSchema.safeParse({
      name: "",
      email: "bad",
      password: "short",
      passwordConfirmation: "mismatch",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const fields = formatZodErrors(parsed.error);
      expect(fields.name).toBeDefined();
      expect(fields.email).toBeDefined();
      expect(fields.password).toBeDefined();
      expect(Array.isArray(fields.name)).toBe(true);
    }
  });
});
