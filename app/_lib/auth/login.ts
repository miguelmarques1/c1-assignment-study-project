"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/app/_lib/db";
import { DUMMY_HASH, verifyPassword } from "@/app/_lib/password";
import { setSessionCookie } from "@/app/_lib/cookies";
import {
  generateSessionId,
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_SLIDING_TTL_MS,
} from "@/app/_lib/auth/session-store";
import { loginSchema, type FieldErrors } from "@/app/_lib/validation";

export type LoginState = {
  ok: boolean;
  errors?: FieldErrors;
};

const GENERIC_ERROR: FieldErrors = {
  _form: ["Invalid email or password"],
};

export async function login(
  _prev: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    // Keep timing comparable with the "user not found" path and never disclose
    // which field failed — the generic form-level error is used for all login
    // failure branches.
    await verifyPassword("placeholder", DUMMY_HASH);
    return { ok: false, errors: GENERIC_ERROR };
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    await verifyPassword(password, DUMMY_HASH);
    return { ok: false, errors: GENERIC_ERROR };
  }

  if (user.isSuspended) {
    await verifyPassword(password, user.passwordHash);
    return { ok: false, errors: GENERIC_ERROR };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { ok: false, errors: GENERIC_ERROR };
  }

  const [session] = await prisma.$transaction([
    prisma.session.create({
      data: {
        id: generateSessionId(),
        userId: user.id,
        expiresAt: new Date(Date.now() + SESSION_SLIDING_TTL_MS),
        absoluteExpiresAt: new Date(Date.now() + SESSION_ABSOLUTE_TTL_MS),
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }),
  ]);
  await setSessionCookie(session.id);
  redirect("/app");
}
