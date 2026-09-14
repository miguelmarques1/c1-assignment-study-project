import { z } from 'zod';

/**
 * Email is normalized here rather than in each caller, so the API, the web form
 * and the seed command all agree on what "the same account" means.
 */
export const emailField = z
  .string({ error: 'Enter a valid email address.' })
  // Normalize first, validate second: a trailing space typed into a login form
  // is a typo to absorb, not a reason to reject the address.
  .transform((value) => value.trim().toLowerCase())
  .pipe(
    z
      .email({ error: 'Enter a valid email address.' })
      .max(255, { error: 'Email must be at most 255 characters.' }),
  );

export const passwordField = z
  .string()
  .min(8, { error: 'Password must be at least 8 characters.' })
  .max(200, { error: 'Password must be at most 200 characters.' });

/** New passwords are held to a longer minimum than the one required to log in. */
export const newPasswordField = z
  .string()
  .min(10, { error: 'New password must be at least 10 characters.' })
  .max(200, { error: 'New password must be at most 200 characters.' });

export const loginSchema = z.object({
  email: emailField,
  password: passwordField,
});

export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: passwordField,
    newPassword: newPasswordField,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    error: 'New password must be different from the current one.',
    path: ['newPassword'],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Public shape of a user. Never includes the password hash. */
export const publicUserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
});

export type PublicUser = z.infer<typeof publicUserSchema>;

export const currentUserSchema = publicUserSchema.extend({
  sessionExpiresAt: z.iso.datetime(),
});

export type CurrentUser = z.infer<typeof currentUserSchema>;
