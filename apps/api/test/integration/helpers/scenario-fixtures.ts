import { join } from 'node:path';

import request from 'supertest';
import { vi } from 'vitest';

import { PasswordService } from '../../../src/auth/password.service';
import { LiveKitService } from '../../../src/classroom/livekit.service';
import { CredentialCryptoService } from '../../../src/credentials/credential-crypto.service';
import { PromptRegistryService } from '../../../src/prompts/prompt-registry.service';
import { createTestContext, type TestContext } from './test-app';

const PASSWORD = 'a perfectly fine password';
const passwords = new PasswordService();

export interface SeededUser {
  id: string;
  email: string;
  displayName: string;
  cookie: string;
  /** The Gemini key stored for this user, or null when they have none. */
  geminiKey: string | null;
}

/**
 * A logged-in account, optionally holding a valid Gemini key stored through
 * the real vault encryption — so F04 resolves and decrypts it exactly as it
 * would in production, and the fake SDK sees which key reached it.
 */
export async function seedUser(
  ctx: TestContext,
  email: string,
  displayName: string,
  options: { withKey?: boolean } = { withKey: true },
): Promise<SeededUser> {
  const user = await ctx.prisma.user.create({
    data: { email, displayName, passwordHash: await passwords.hash(PASSWORD) },
  });

  let geminiKey: string | null = null;
  if (options.withKey !== false) {
    geminiKey = `AIza-test-key-for-${displayName.toLowerCase()}-0000000000`;
    const payload = ctx.app.get(CredentialCryptoService).encrypt(geminiKey);
    await ctx.prisma.userCredential.create({
      data: {
        userId: user.id,
        provider: 'gemini',
        ciphertext: new Uint8Array(payload.ciphertext),
        iv: new Uint8Array(payload.iv),
        authTag: new Uint8Array(payload.authTag),
        lastFour: geminiKey.slice(-4),
        status: 'valid',
      },
    });
  }

  const response = await request(ctx.app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: PASSWORD });
  const cookie = (response.headers['set-cookie'] as unknown as string[])[0]!;
  return { id: user.id, email, displayName, cookie, geminiKey };
}

/** Polls `read` until `done` holds — generation is fire-and-forget, so tests wait on its end state. */
export async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 15_000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = await read();
    if (done(value)) {
      return value;
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`waitFor timed out; last value: ${JSON.stringify(value)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Lets background generation finish before the next test wipes the tables under it. */
export async function settleGeneration(ctx: TestContext): Promise<void> {
  await waitFor(
    async () =>
      (await ctx.prisma.lessonScenario.count({ where: { status: 'pending' } })) +
      (await ctx.prisma.lessonRoleCard.count({ where: { status: 'pending' } })),
    (pending) => pending === 0,
    15_000,
  ).catch(() => undefined);
}

export async function resetTables(ctx: TestContext): Promise<void> {
  await ctx.prisma.lessonRoleCard.deleteMany();
  await ctx.prisma.lessonScenario.deleteMany();
  await ctx.prisma.lessonParticipant.deleteMany();
  await ctx.prisma.lesson.deleteMany();
  await ctx.prisma.promptExecution.deleteMany();
  await ctx.prisma.credentialUsage.deleteMany();
  await ctx.prisma.userCredential.deleteMany();
  await ctx.prisma.user.deleteMany();
}

/**
 * The test app, booted the way `main.ts` boots the real one where it
 * matters here: the prompt registry is loaded from the real prompt files —
 * `createTestContext` stops at `app.init()`, before that boot step.
 */
export async function createScenarioTestContext(): Promise<TestContext> {
  const ctx = await createTestContext({ overrides: [{ token: LiveKitService, useValue: fakeLiveKit() }] });
  const registry = ctx.app.get(PromptRegistryService);
  await registry.loadAll(join(__dirname, '..', '..', '..', 'prompts'));
  return ctx;
}

/** A LiveKitService that admits everyone and never touches the network. */
export function fakeLiveKit() {
  let tokenCounter = 0;
  return {
    listParticipants: vi.fn(async () => []),
    createRoom: vi.fn().mockResolvedValue(undefined),
    deleteRoom: vi.fn().mockResolvedValue(undefined),
    issueAccessToken: vi.fn(async () => ({
      token: `fake-token-${++tokenCounter}`,
      expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
    })),
    verifyWebhook: vi.fn(),
  };
}
