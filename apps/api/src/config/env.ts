import { z } from 'zod';

/**
 * The environment contract. Parsed once, before anything connects, so a typo in
 * .env fails at boot with the variable named rather than surfacing as a runtime
 * error three layers deep.
 */

const seedUserSchema = z.object({
  email: z
    .string({ error: 'Each seed user needs a valid email.' })
    .transform((value) => value.trim().toLowerCase())
    .pipe(z.email({ error: 'Each seed user needs a valid email.' }).max(255)),
  displayName: z.string().min(1).max(100),
  password: z
    .string()
    .min(10, { error: 'Seed passwords must be at least 10 characters.' })
    .max(200),
});

export type SeedUser = z.infer<typeof seedUserSchema>;

const seedUsersSchema = z.array(seedUserSchema);

/**
 * SEED_USERS arrives as a JSON string. Parsing it here means a malformed array
 * is caught at boot rather than when someone finally runs the seed command.
 */
const seedUsersField = z
  .string()
  .optional()
  .transform((raw, ctx): SeedUser[] => {
    if (!raw || raw.trim() === '') {
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'SEED_USERS must be valid JSON (an array of user objects).',
      });
      return z.NEVER;
    }

    const result = seedUsersSchema.safeParse(parsed);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          code: 'custom',
          message: `SEED_USERS[${issue.path.join('.')}]: ${issue.message}`,
        });
      }
      return z.NEVER;
    }

    return result.data;
  });

/**
 * Both the missing and the too-short case carry the same wording, because from
 * the operator's point of view they are the same mistake.
 */
const SESSION_SECRET_ERROR = 'SESSION_SECRET is missing or shorter than 32 characters.';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string({ error: 'DATABASE_URL is required.' }).min(1),
  REDIS_URL: z.string({ error: 'REDIS_URL is required.' }).min(1),

  SESSION_SECRET: z
    .string({ error: SESSION_SECRET_ERROR })
    .min(32, { error: SESSION_SECRET_ERROR }),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604_800),

  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCKOUT_SECONDS: z.coerce.number().int().positive().default(900),

  S3_ENDPOINT: z.url({ error: 'S3_ENDPOINT must be a URL.' }),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string({ error: 'S3_ACCESS_KEY is required.' }).min(1),
  S3_SECRET_KEY: z.string({ error: 'S3_SECRET_KEY is required.' }).min(1),
  S3_BUCKET: z.string({ error: 'S3_BUCKET is required.' }).min(1),

  LIVEKIT_URL: z.url({ error: 'LIVEKIT_URL must be a URL.' }),
  LIVEKIT_API_KEY: z.string({ error: 'LIVEKIT_API_KEY is required.' }).min(1),
  LIVEKIT_API_SECRET: z.string({ error: 'LIVEKIT_API_SECRET is required.' }).min(1),

  SEED_USERS: seedUsersField,
});

export type AppEnv = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n  ${issues.join('\n  ')}`);
    this.name = 'EnvValidationError';
  }
}

/**
 * Validates the given source (defaults to process.env) and returns the typed
 * config. Throws EnvValidationError listing every problem at once, so fixing a
 * fresh .env does not become a guess-one-variable-at-a-time loop.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    });
    throw new EnvValidationError(issues);
  }

  return result.data;
}

let cached: AppEnv | undefined;

/** Memoized accessor for the process-wide config. */
export function env(): AppEnv {
  cached ??= loadEnv();
  return cached;
}

/** Test seam: forget the memoized config so a suite can load a different one. */
export function resetEnvCache(): void {
  cached = undefined;
}
