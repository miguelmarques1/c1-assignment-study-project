import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

export interface WaitOptions {
  databaseUrl: string;
  redisUrl: string;
  /** Total budget before giving up. */
  timeoutMs?: number;
  /** Gap between attempts. */
  intervalMs?: number;
  log?: (message: string) => void;
}

export class DependencyUnreachableError extends Error {
  constructor(
    public readonly dependency: string,
    public readonly host: string,
    public readonly timeoutMs: number,
    public readonly lastError: string,
  ) {
    super(
      `Dependency unreachable: ${dependency} (host: ${host}). ` +
        `Giving up after ${Math.round(timeoutMs / 1000)}s. Last error: ${lastError}`,
    );
    this.name = 'DependencyUnreachableError';
  }
}

/** Best-effort host:port for log lines; never throws on a malformed URL. */
function hostOf(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return url.port ? `${url.hostname}:${url.port}` : url.hostname;
  } catch {
    return 'unknown';
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function probePostgres(databaseUrl: string): Promise<void> {
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await client.$queryRaw`SELECT 1`;
  } finally {
    await client.$disconnect().catch(() => undefined);
  }
}

async function probeRedis(redisUrl: string): Promise<void> {
  const client = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    connectTimeout: 3_000,
  });
  try {
    await client.connect();
    await client.ping();
  } finally {
    client.disconnect();
  }
}

async function waitFor(
  name: string,
  host: string,
  probe: () => Promise<void>,
  timeoutMs: number,
  intervalMs: number,
  log: (message: string) => void,
): Promise<number> {
  const startedAt = Date.now();
  let lastError = 'unknown';
  let attempt = 0;

  while (Date.now() - startedAt < timeoutMs) {
    attempt += 1;
    try {
      await probe();
      return Date.now() - startedAt;
    } catch (error) {
      lastError = error instanceof Error ? error.message.split('\n')[0] ?? 'unknown' : String(error);
      if (attempt === 1) {
        log(`Waiting for ${name} at ${host}…`);
      }
      await sleep(intervalMs);
    }
  }

  throw new DependencyUnreachableError(name, host, timeoutMs, lastError);
}

/**
 * Blocks until PostgreSQL and Redis both answer, or the budget runs out. The API
 * must never start half-working: a server that accepts requests it cannot serve
 * is worse than one that refused to boot.
 *
 * MinIO and LiveKit are deliberately not waited on — they are reported by
 * /health and needed by later features, but the API is useful without them.
 */
export async function waitForDependencies(options: WaitOptions): Promise<void> {
  const {
    databaseUrl,
    redisUrl,
    timeoutMs = 60_000,
    intervalMs = 2_000,
    // Runs before Nest's logger exists; stdout is the only channel here.
    // eslint-disable-next-line no-console
    log = (message: string) => console.log(message),
  } = options;

  const postgresMs = await waitFor(
    'postgres',
    hostOf(databaseUrl),
    () => probePostgres(databaseUrl),
    timeoutMs,
    intervalMs,
    log,
  );
  log(`postgres ready in ${postgresMs}ms`);

  const redisMs = await waitFor(
    'redis',
    hostOf(redisUrl),
    () => probeRedis(redisUrl),
    timeoutMs,
    intervalMs,
    log,
  );
  log(`redis ready in ${redisMs}ms`);
}
