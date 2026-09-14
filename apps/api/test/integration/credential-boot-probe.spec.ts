import { randomBytes } from 'node:crypto';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  MasterKeyMismatchError,
  verifyCredentialDecryptability,
} from '../../src/boot/verify-credential-decryptability';
import {
  decryptWithKey,
  encryptWithKey,
  parseMasterKey,
} from '../../src/credentials/credential-crypto';
import { applyMigrations, TEST_MASTER_KEY } from './helpers/test-app';

let postgres: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let userId: string;

const REAL_KEY = parseMasterKey(TEST_MASTER_KEY);
const OTHER_KEY = randomBytes(32);

/**
 * A crypto service bound to an explicit key, matching the shape the probe
 * consumes. Using the real service would tie every case to one master key,
 * which is exactly what these tests need to vary.
 */
function cryptoBoundTo(key: Buffer) {
  return {
    canDecrypt(payload: { ciphertext: Buffer; iv: Buffer; authTag: Buffer }) {
      try {
        decryptWithKey(key, payload);
        return true;
      } catch {
        return false;
      }
    },
  } as never;
}

/**
 * Guards the helper itself. Without this, a broken `cryptoBoundTo` reports every
 * row as unreadable, which makes the "refuses to start" test pass for the wrong
 * reason while the others fail confusingly.
 */
function assertHelperWorks(): void {
  const payload = encryptWithKey(REAL_KEY, 'sanity-check-value');
  const probe = cryptoBoundTo(REAL_KEY) as unknown as {
    canDecrypt: (p: typeof payload) => boolean;
  };
  if (!probe.canDecrypt(payload)) {
    throw new Error('cryptoBoundTo is broken: it cannot decrypt what it just encrypted.');
  }
}

async function storeCredential(provider: string, key: Buffer, secret: string) {
  const payload = encryptWithKey(key, secret);
  await prisma.userCredential.create({
    data: {
      userId,
      provider,
      ciphertext: new Uint8Array(payload.ciphertext),
      iv: new Uint8Array(payload.iv),
      authTag: new Uint8Array(payload.authTag),
      lastFour: secret.slice(-4),
      region: provider === 'azure_speech' ? 'brazilsouth' : null,
      status: 'valid',
    },
  });
}

beforeAll(async () => {
  postgres = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = `${postgres.getConnectionUri()}?schema=public`;
  await applyMigrations(url);
  prisma = new PrismaClient({ datasources: { db: { url } } });
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect().catch(() => undefined);
  await postgres?.stop().catch(() => undefined);
});

beforeEach(async () => {
  await prisma.userCredential.deleteMany();
  await prisma.user.deleteMany();
  const user = await prisma.user.create({
    data: { email: 'probe@example.com', displayName: 'Probe', passwordHash: 'x'.repeat(60) },
  });
  userId = user.id;
});

describe('boot decryptability probe', () => {
  it('the_test_helper_can_actually_decrypt', () => {
    expect(() => assertHelperWorks()).not.toThrow();
  });

  it('starts_normally_with_no_credentials_stored', async () => {
    const result = await verifyCredentialDecryptability({
      prisma,
      crypto: cryptoBoundTo(REAL_KEY),
    });

    expect(result).toEqual({ checked: 0, invalidated: 0 });
  });

  it('starts_normally_when_every_row_decrypts', async () => {
    await storeCredential('gemini', REAL_KEY, 'AIzaSy-good-key-value-here-f4Qa');

    const result = await verifyCredentialDecryptability({
      prisma,
      crypto: cryptoBoundTo(REAL_KEY),
    });

    expect(result).toEqual({ checked: 1, invalidated: 0 });
    const row = await prisma.userCredential.findFirstOrThrow();
    expect(row.status).toBe('valid');
  });

  it('refuses_to_start_when_every_row_fails', async () => {
    await storeCredential('gemini', REAL_KEY, 'AIzaSy-good-key-value-here-f4Qa');
    await storeCredential('azure_speech', REAL_KEY, 'azure-key-value-here-0000');

    // Probing with a different master key is what a changed BYOK_MASTER_KEY
    // looks like from the inside.
    await expect(
      verifyCredentialDecryptability({ prisma, crypto: cryptoBoundTo(OTHER_KEY) }),
    ).rejects.toThrow(MasterKeyMismatchError);

    await expect(
      verifyCredentialDecryptability({ prisma, crypto: cryptoBoundTo(OTHER_KEY) }),
    ).rejects.toThrow('Stored credentials cannot be decrypted with the current BYOK_MASTER_KEY.');
  });

  it('marks_only_the_corrupt_row_invalid_when_some_decrypt', async () => {
    await storeCredential('gemini', REAL_KEY, 'AIzaSy-good-key-value-here-f4Qa');
    // A row written under a different key stands in for a corrupted one: from
    // the probe's point of view they are indistinguishable.
    await storeCredential('azure_speech', OTHER_KEY, 'azure-key-value-here-0000');

    const result = await verifyCredentialDecryptability({
      prisma,
      crypto: cryptoBoundTo(REAL_KEY),
    });

    expect(result).toEqual({ checked: 2, invalidated: 1 });

    const gemini = await prisma.userCredential.findFirstOrThrow({ where: { provider: 'gemini' } });
    const azure = await prisma.userCredential.findFirstOrThrow({
      where: { provider: 'azure_speech' },
    });
    expect(gemini.status).toBe('valid');
    expect(azure.status).toBe('invalid');
  });

  it('is_idempotent_across_repeated_boots', async () => {
    await storeCredential('gemini', REAL_KEY, 'AIzaSy-good-key-value-here-f4Qa');
    await storeCredential('azure_speech', OTHER_KEY, 'azure-key-value-here-0000');

    await verifyCredentialDecryptability({ prisma, crypto: cryptoBoundTo(REAL_KEY) });
    const second = await verifyCredentialDecryptability({
      prisma,
      crypto: cryptoBoundTo(REAL_KEY),
    });

    expect(second).toEqual({ checked: 2, invalidated: 1 });
  });
});
