import { join } from 'node:path';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const generateContentMock = vi.hoisted(() => vi.fn());
const listMock = vi.hoisted(() => vi.fn().mockResolvedValue({}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock, list: listMock };
  },
  ThinkingLevel: { LOW: 'LOW' },
}));

import { resetEnvCache } from '../../src/config/env';
import { encryptWithKey, parseMasterKey } from '../../src/credentials/credential-crypto';
import { CredentialCryptoService } from '../../src/credentials/credential-crypto.service';
import { CredentialExecutorService } from '../../src/credentials/credential-executor.service';
import { CredentialsService } from '../../src/credentials/credentials.service';
import { CredentialUsageService } from '../../src/credentials/credential-usage.service';
import { PromptExecutionTelemetryService } from '../../src/prompts/prompt-execution-telemetry.service';
import { PromptExecutionService } from '../../src/prompts/prompt-execution.service';
import { PromptRegistryService } from '../../src/prompts/prompt-registry.service';
import { applyMigrations, TEST_MASTER_KEY } from './helpers/test-app';

const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'prompts-single');

let postgres: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let userId: string;
let service: PromptExecutionService;

function fakeResponse(json: unknown) {
  return {
    text: JSON.stringify(json),
    usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 8, thoughtsTokenCount: 4 },
  };
}

beforeAll(async () => {
  postgres = await new PostgreSqlContainer('postgres:16-alpine').start();
  const databaseUrl = `${postgres.getConnectionUri()}?schema=public`;
  await applyMigrations(databaseUrl);
  prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    REDIS_URL: 'redis://localhost:6379',
    SESSION_SECRET: 'test-session-secret-that-is-long-enough',
    BYOK_MASTER_KEY: TEST_MASTER_KEY,
    S3_ENDPOINT: 'http://localhost:9000',
    S3_ACCESS_KEY: 'minioadmin',
    S3_SECRET_KEY: 'minioadmin',
    S3_BUCKET: 'english-quest-test',
    LIVEKIT_URL: 'http://localhost:7880',
    LIVEKIT_API_KEY: 'devkey',
    LIVEKIT_API_SECRET: 'devsecret',
  });
  resetEnvCache();

  const registry = new PromptRegistryService();
  await registry.loadAll(FIXTURES_DIR);

  const crypto = new CredentialCryptoService();
  // resolveDecrypted/markStatus never touch the validation dispatcher, so a
  // real CredentialsService can be built without wiring the provider probes.
   
  const credentialsService = new CredentialsService(prisma as any, crypto, undefined as any);
  const usage = new CredentialUsageService(prisma as never);
  const executor = new CredentialExecutorService(credentialsService, usage);
  const telemetry = new PromptExecutionTelemetryService(prisma as never);

  service = new PromptExecutionService(registry, executor, telemetry);
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect().catch(() => undefined);
  await postgres?.stop().catch(() => undefined);
  resetEnvCache();
});

beforeEach(async () => {
  generateContentMock.mockReset();
  await prisma.promptExecution.deleteMany();
  await prisma.credentialUsage.deleteMany();
  await prisma.userCredential.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: { email: 'exec@example.com', displayName: 'Exec', passwordHash: 'x'.repeat(60) },
  });
  userId = user.id;

  const payload = encryptWithKey(parseMasterKey(TEST_MASTER_KEY), 'AIzaSy-fake-key-for-telemetry-test');
  await prisma.userCredential.create({
    data: {
      userId,
      provider: 'gemini',
      ciphertext: new Uint8Array(payload.ciphertext),
      iv: new Uint8Array(payload.iv),
      authTag: new Uint8Array(payload.authTag),
      lastFour: 'test',
      status: 'valid',
    },
  });
});

describe('prompt execution telemetry', () => {
  it('writes_one_row_per_execution', async () => {
    generateContentMock.mockResolvedValueOnce(fakeResponse({ greeting: 'hi' }));

    await service.execute(userId, 'well-formed', { name: 'Ana' });

    const rows = await prisma.promptExecution.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.outcome).toBe('ok');
  });

  it('records_token_counts_and_latency', async () => {
    generateContentMock.mockResolvedValueOnce(fakeResponse({ greeting: 'hi' }));

    await service.execute(userId, 'well-formed', { name: 'Ana' });

    const row = await prisma.promptExecution.findFirstOrThrow({ where: { userId } });
    expect(row.inputTokens).toBe(12);
    expect(row.outputTokens).toBe(8 + 4);
    expect(row.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('records_raw_response_only_on_hard_error', async () => {
    generateContentMock.mockResolvedValueOnce(fakeResponse({ greeting: 'hi' }));
    await service.execute(userId, 'well-formed', { name: 'Ana' });
    const okRow = await prisma.promptExecution.findFirstOrThrow({ where: { userId } });
    expect(okRow.rawResponse).toBeNull();

    await prisma.promptExecution.deleteMany();
    generateContentMock
      .mockResolvedValueOnce(fakeResponse({ wrong: 'shape' }))
      .mockResolvedValueOnce(fakeResponse({ still: 'wrong' }));

    await expect(service.execute(userId, 'well-formed', { name: 'Ana' })).rejects.toMatchObject({
      code: 'PROMPT001',
    });

    const hardFailRow = await prisma.promptExecution.findFirstOrThrow({ where: { userId } });
    expect(hardFailRow.outcome).toBe('validation_failed_hard_error');
    expect(hardFailRow.rawResponse).toContain('still');
  });

  it('truncates_an_oversized_raw_response', async () => {
    const oversized = 'x'.repeat(50_000);
    generateContentMock
      .mockResolvedValueOnce({ text: oversized, usageMetadata: {} })
      .mockResolvedValueOnce({ text: oversized, usageMetadata: {} });

    await expect(service.execute(userId, 'well-formed', { name: 'Ana' })).rejects.toMatchObject({
      code: 'PROMPT001',
    });

    const row = await prisma.promptExecution.findFirstOrThrow({ where: { userId } });
    expect(row.rawResponse?.length).toBe(10_000);
  });

  it('also_writes_a_credential_usage_audit_row', async () => {
    generateContentMock.mockResolvedValueOnce(fakeResponse({ greeting: 'hi' }));

    await service.execute(userId, 'well-formed', { name: 'Ana' });

    const usageRows = await prisma.credentialUsage.findMany({ where: { userId } });
    expect(usageRows).toHaveLength(1);
    expect(usageRows[0]?.outcome).toBe('ok');
    expect(usageRows[0]?.feature).toBe('F04_well-formed');
  });

  it('a_telemetry_write_failure_does_not_fail_the_execution', async () => {
    generateContentMock.mockResolvedValueOnce(fakeResponse({ greeting: 'hi' }));
    const brokenPrisma = {
      promptExecution: { create: () => Promise.reject(new Error('db is down')) },
    };
    const brokenTelemetry = new PromptExecutionTelemetryService(brokenPrisma as never);
    const crypto = new CredentialCryptoService();
     
    const credentialsService = new CredentialsService(prisma as any, crypto, undefined as any);
    const usage = new CredentialUsageService(prisma as never);
    const executor = new CredentialExecutorService(credentialsService, usage);
    const registry = new PromptRegistryService();
    await registry.loadAll(FIXTURES_DIR);
    const resilientService = new PromptExecutionService(registry, executor, brokenTelemetry);

    const result = await resilientService.execute(userId, 'well-formed', { name: 'Ana' });

    expect(result.data).toEqual({ greeting: 'hi' });
  });
});
