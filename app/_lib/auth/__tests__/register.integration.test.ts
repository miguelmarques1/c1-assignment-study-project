import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("../../../../tests/setup/next-headers-mock"));

import { prisma } from "@/app/_lib/db";
import { register } from "@/app/_lib/auth/register";
import { currentSessionCookie, resetJar } from "../../../../tests/setup/cookie-jar";
import { isNextRedirect, redirectPath } from "../../../../tests/setup/redirect";

function asForm(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}

describe("register server action (integration)", () => {
  beforeEach(async () => {
    resetJar();
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("register_with_valid_inputs_creates_user_session_and_redirects", async () => {
    let redirectedTo: string | null = null;
    try {
      await register(
        undefined,
        asForm({
          name: "Ada Lovelace",
          email: "ada@example.com",
          password: "analytical1",
          passwordConfirmation: "analytical1",
        }),
      );
    } catch (err) {
      if (!isNextRedirect(err)) throw err;
      redirectedTo = redirectPath(err);
    }

    expect(redirectedTo).toBe("/app");
    const user = await prisma.user.findUnique({ where: { email: "ada@example.com" } });
    expect(user).not.toBeNull();
    const sessions = await prisma.session.findMany({ where: { userId: user!.id } });
    expect(sessions).toHaveLength(1);
    expect(currentSessionCookie()).toBe(sessions[0]!.id);
  });

  it("register_rejects_short_password_inline", async () => {
    const state = await register(
      undefined,
      asForm({
        name: "A",
        email: "x@y.co",
        password: "abc1",
        passwordConfirmation: "abc1",
      }),
    );
    expect(state.ok).toBe(false);
    expect(state.errors?.password?.[0]).toMatch(/at least 8 characters/i);
    const u = await prisma.user.findUnique({ where: { email: "x@y.co" } });
    expect(u).toBeNull();
  });

  it("register_rejects_password_without_letter_inline", async () => {
    const state = await register(
      undefined,
      asForm({
        name: "A",
        email: "x@y.co",
        password: "12345678",
        passwordConfirmation: "12345678",
      }),
    );
    expect(state.errors?.password?.[0]).toMatch(/at least one letter/i);
  });

  it("register_rejects_password_without_number_inline", async () => {
    const state = await register(
      undefined,
      asForm({
        name: "A",
        email: "x@y.co",
        password: "abcdefgh",
        passwordConfirmation: "abcdefgh",
      }),
    );
    expect(state.errors?.password?.[0]).toMatch(/at least one number/i);
  });

  it("register_rejects_duplicate_email", async () => {
    await prisma.user.create({
      data: {
        name: "Existing",
        email: "dup@example.com",
        passwordHash:
          "$2a$12$placeholderplaceholderplaceholderplaceholderplaceholde",
      },
    });
    const state = await register(
      undefined,
      asForm({
        name: "Another",
        email: "dup@example.com",
        password: "analytical1",
        passwordConfirmation: "analytical1",
      }),
    );
    expect(state.errors?.email?.[0]).toMatch(/already exists/i);
    const users = await prisma.user.findMany({ where: { email: "dup@example.com" } });
    expect(users).toHaveLength(1);
  });

  it("register_rejects_duplicate_email_case_insensitive", async () => {
    await prisma.user.create({
      data: {
        name: "Existing",
        email: "mixed@example.com",
        passwordHash:
          "$2a$12$placeholderplaceholderplaceholderplaceholderplaceholde",
      },
    });
    const state = await register(
      undefined,
      asForm({
        name: "Another",
        email: "MIXED@Example.com",
        password: "analytical1",
        passwordConfirmation: "analytical1",
      }),
    );
    expect(state.errors?.email?.[0]).toMatch(/already exists/i);
  });

  it("register_rejects_password_confirmation_mismatch", async () => {
    const state = await register(
      undefined,
      asForm({
        name: "Ada",
        email: "mm@example.com",
        password: "analytical1",
        passwordConfirmation: "different2",
      }),
    );
    expect(state.errors?.passwordConfirmation?.[0]).toMatch(/do not match/i);
    const u = await prisma.user.findUnique({ where: { email: "mm@example.com" } });
    expect(u).toBeNull();
  });

  it("register_stores_password_as_bcrypt_hash_not_plaintext", async () => {
    try {
      await register(
        undefined,
        asForm({
          name: "Ada",
          email: "bcrypt@example.com",
          password: "analytical1",
          passwordConfirmation: "analytical1",
        }),
      );
    } catch (err) {
      if (!isNextRedirect(err)) throw err;
    }
    const u = await prisma.user.findUnique({ where: { email: "bcrypt@example.com" } });
    expect(u).not.toBeNull();
    expect(u!.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(u!.passwordHash).not.toBe("analytical1");
  });
});
