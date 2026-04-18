"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/db";
import { hashPassword } from "@/app/_lib/password";
import { setSessionCookie } from "@/app/_lib/cookies";
import {
  generateSessionId,
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_SLIDING_TTL_MS,
} from "@/app/_lib/auth/session-store";
import {
  formatZodErrors,
  registerSchema,
  type FieldErrors,
} from "@/app/_lib/validation";

export type RegisterState = {
  ok: boolean;
  errors?: FieldErrors;
};

export async function register(
  _prev: RegisterState | undefined,
  formData: FormData,
): Promise<RegisterState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    passwordConfirmation: formData.get("passwordConfirmation"),
  });

  if (!parsed.success) {
    return { ok: false, errors: formatZodErrors(parsed.error) };
  }

  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return {
      ok: false,
      errors: {
        email: [
          "An account with this email already exists — try logging in",
        ],
      },
    };
  }

  const passwordHash = await hashPassword(password);

  let sessionId: string;
  try {
    sessionId = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name, email, passwordHash },
      });
      const now = Date.now();
      const session = await tx.session.create({
        data: {
          id: generateSessionId(),
          userId: user.id,
          expiresAt: new Date(now + SESSION_SLIDING_TTL_MS),
          absoluteExpiresAt: new Date(now + SESSION_ABSOLUTE_TTL_MS),
        },
      });
      return session.id;
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return {
        ok: false,
        errors: {
          email: [
            "An account with this email already exists — try logging in",
          ],
        },
      };
    }
    throw err;
  }

  await setSessionCookie(sessionId);
  redirect("/app");
}
