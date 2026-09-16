import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import { raw } from 'express';

import { AppModule } from '../../../src/app.module';
import { HttpExceptionFilter } from '../../../src/common/http-exception.filter';
import { resetEnvCache } from '../../../src/config/env';

const execFileAsync = promisify(execFile);

export const TEST_SESSION_SECRET = 'test-session-secret-that-is-long-enough';

/** Deterministic 32-byte master key, so a suite can assert against known ciphertext behaviour. */
export const TEST_MASTER_KEY = Buffer.alloc(32, 7).toString('base64');

export interface TestContext {
  app: INestApplication;
  prisma: PrismaClient;
  postgres: StartedPostgreSqlContainer;
  redis: StartedRedisContainer;
  databaseUrl: string;
  redisUrl: string;
  close: () => Promise<void>;
}

/**
 * Boots real PostgreSQL and Redis containers, applies the migrations and wires
 * a Nest application configured exactly like production. Slower than mocking,
 * but the behaviour the PRD pins down - sliding TTLs, lockout windows, unique
 * constraints - only exists in the real stores.
 */
export interface TestContextOptions {
  extraEnv?: Record<string, string>;
  /**
   * Replaces a provider with a stub. Used to keep the suite from making real
   * network calls — stubs live only here, never in production modules.
   */
  overrides?: Array<{ token: unknown; useValue: unknown }>;
}

export async function createTestContext(
  optionsOrEnv: TestContextOptions | Record<string, string> = {},
): Promise<TestContext> {
  const options: TestContextOptions =
    'extraEnv' in optionsOrEnv || 'overrides' in optionsOrEnv
      ? (optionsOrEnv as TestContextOptions)
      : { extraEnv: optionsOrEnv as Record<string, string> };
  const extraEnv = options.extraEnv ?? {};
  const postgres = await new PostgreSqlContainer('postgres:16-alpine').start();
  const redis = await new RedisContainer('redis:7-alpine').start();

  const databaseUrl = `${postgres.getConnectionUri()}?schema=public`;
  const redisUrl = redis.getConnectionUrl();

  await applyMigrations(databaseUrl);

  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    SESSION_SECRET: TEST_SESSION_SECRET,
    BYOK_MASTER_KEY: TEST_MASTER_KEY,
    S3_ENDPOINT: 'http://localhost:9000',
    S3_ACCESS_KEY: 'minioadmin',
    S3_SECRET_KEY: 'minioadmin',
    S3_BUCKET: 'english-quest-test',
    LIVEKIT_URL: 'http://localhost:7880',
    LIVEKIT_WS_URL: 'ws://localhost:7880',
    LIVEKIT_API_KEY: 'devkey',
    LIVEKIT_API_SECRET: 'devsecret',
    ...extraEnv,
  });
  resetEnvCache();

  const builder = Test.createTestingModule({ imports: [AppModule] });
  for (const override of options.overrides ?? []) {
    builder.overrideProvider(override.token).useValue(override.useValue);
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser(TEST_SESSION_SECRET));
  // Mirrors main.ts: the webhook signature is verified over the raw body,
  // which Nest's default parsers never populate for LiveKit's content type.
  app.use('/classroom/livekit-webhook', raw({ type: 'application/webhook+json' }));
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  return {
    app,
    prisma,
    postgres,
    redis,
    databaseUrl,
    redisUrl,
    close: async () => {
      await prisma.$disconnect().catch(() => undefined);
      await app.close().catch(() => undefined);
      await redis.stop().catch(() => undefined);
      await postgres.stop().catch(() => undefined);
      resetEnvCache();
    },
  };
}

export async function applyMigrations(databaseUrl: string): Promise<void> {
  const cwd = resolve(__dirname, '../../..');
  await execFileAsync('prisma', ['migrate', 'deploy'], {
    cwd,
    shell: true,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    windowsHide: true,
  });
}

/** Extracts a raw cookie value from a Set-Cookie header list. */
export function cookieValue(setCookie: string[] | undefined, name: string): string | undefined {
  const header = setCookie?.find((entry) => entry.startsWith(`${name}=`));
  return header?.split(';')[0]?.slice(name.length + 1);
}

/**
 * Recovers the session token from the signed cookie.
 *
 * The cookie is set with `signed: true`, so its wire value is
 * `s:<token>.<signature>`, URL-encoded. Using that string as a Redis key looks
 * plausible and is always wrong — it addresses a key that never existed, which
 * makes "the session is gone" assertions pass for the wrong reason.
 */
export function sessionTokenFrom(setCookie: string[] | undefined): string | undefined {
  const raw = cookieValue(setCookie, SESSION_COOKIE_NAME);
  if (!raw) {
    return undefined;
  }

  const decoded = decodeURIComponent(raw);
  const unprefixed = decoded.startsWith('s:') ? decoded.slice(2) : decoded;

  // The token is base64url and contains no dots; the signature is appended
  // after the final one.
  const lastDot = unprefixed.lastIndexOf('.');
  return lastDot === -1 ? unprefixed : unprefixed.slice(0, lastDot);
}

export const SESSION_COOKIE_NAME = 'eq_session';
