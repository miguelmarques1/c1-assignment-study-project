import { ERROR_CODES } from '@english-quest/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PasswordService } from '../../src/auth/password.service';
import { CredentialExecutorService } from '../../src/credentials/credential-executor.service';
import { ProviderValidationService } from '../../src/credentials/validation/provider-validation.service';
import type { ValidationOutcome } from '../../src/credentials/validation/validation-outcome';
import { RedisService } from '../../src/redis/redis.service';
import { createTestContext, type TestContext } from './helpers/test-app';

const GEMINI_KEY = 'AIzaSyD-a-very-real-looking-gemini-key-f4Qa';
const AZURE_KEY = 'a-very-real-looking-azure-speech-key-0000';
const REGION = 'brazilsouth';
const EMAIL = 'vault@example.com';
const PASSWORD = 'a perfectly fine password';

/** Stub so the suite never makes a real provider call. */
const validateMock = vi.fn<(...args: unknown[]) => Promise<ValidationOutcome>>();

let ctx: TestContext;
let userId: string;
let cookie: string;
const passwords = new PasswordService();

async function signIn(email = EMAIL): Promise<string> {
  const response = await request(ctx.app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: PASSWORD });
  return (response.headers['set-cookie'] as unknown as string[])[0]!;
}

beforeAll(async () => {
  ctx = await createTestContext({
    overrides: [
      { token: ProviderValidationService, useValue: { validate: validateMock } },
    ],
  });
}, 180_000);

afterAll(async () => {
  await ctx?.close();
});

beforeEach(async () => {
  await ctx.prisma.credentialUsage.deleteMany();
  await ctx.prisma.userCredential.deleteMany();
  await ctx.prisma.user.deleteMany();
  await ctx.app.get(RedisService).client.flushall();
  validateMock.mockReset();

  const user = await ctx.prisma.user.create({
    data: { email: EMAIL, displayName: 'Vault', passwordHash: await passwords.hash(PASSWORD) },
  });
  userId = user.id;
  cookie = await signIn();
});

function valid(): ValidationOutcome {
  return { status: 'valid', providerMessage: null };
}

describe('credential vault', () => {
  it('saving_a_valid_key_stores_it_and_reports_valid', async () => {
    validateMock.mockResolvedValue(valid());

    const response = await request(ctx.app.getHttpServer())
      .put('/credentials/gemini')
      .set('Cookie', cookie)
      .send({ key: GEMINI_KEY });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('valid');
    expect(response.body.data.maskedKey).toBe('••••f4Qa');
    expect(response.body.data.lastValidatedAt).not.toBeNull();

    expect(await ctx.prisma.userCredential.count({ where: { userId } })).toBe(1);
  });

  it('saving_a_rejected_key_stores_nothing', async () => {
    validateMock.mockResolvedValue({
      status: 'invalid',
      providerMessage: 'API key not valid. Please pass a valid API key.',
    });

    const response = await request(ctx.app.getHttpServer())
      .put('/credentials/gemini')
      .set('Cookie', cookie)
      .send({ key: GEMINI_KEY });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(ERROR_CODES.CREDENTIAL_REJECTED);
    expect(response.body.error.details.providerMessage).toBe(
      'API key not valid. Please pass a valid API key.',
    );
    expect(await ctx.prisma.userCredential.count({ where: { userId } })).toBe(0);
  });

  it('rejection_leaves_a_previously_valid_key_untouched', async () => {
    validateMock.mockResolvedValue(valid());
    await request(ctx.app.getHttpServer())
      .put('/credentials/gemini')
      .set('Cookie', cookie)
      .send({ key: GEMINI_KEY });

    const before = await ctx.prisma.userCredential.findFirstOrThrow({ where: { userId } });

    validateMock.mockResolvedValue({ status: 'invalid', providerMessage: 'nope' });
    await request(ctx.app.getHttpServer())
      .put('/credentials/gemini')
      .set('Cookie', cookie)
      .send({ key: 'AIzaSy-a-different-but-rejected-key-9999' });

    const after = await ctx.prisma.userCredential.findFirstOrThrow({ where: { userId } });
    expect(Buffer.from(after.ciphertext).equals(Buffer.from(before.ciphertext))).toBe(true);
    expect(after.status).toBe('valid');
    expect(after.lastFour).toBe('f4Qa');
  });

  it('provider_timeout_stores_as_unverified', async () => {
    validateMock.mockResolvedValue({
      status: 'unverified',
      providerMessage: 'Probe timed out after 5000ms',
    });

    const response = await request(ctx.app.getHttpServer())
      .put('/credentials/gemini')
      .set('Cookie', cookie)
      .send({ key: GEMINI_KEY });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('unverified');
    expect(await ctx.prisma.userCredential.count({ where: { userId } })).toBe(1);
  });

  it('list_returns_both_providers_always', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/credentials')
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.map((e: { provider: string }) => e.provider).sort()).toEqual([
      'azure_speech',
      'gemini',
    ]);
    expect(response.body.data.every((e: { status: string }) => e.status === 'missing')).toBe(true);
  });

  it('no_response_ever_contains_the_plaintext_key', async () => {
    validateMock.mockResolvedValue(valid());

    const saved = await request(ctx.app.getHttpServer())
      .put('/credentials/gemini')
      .set('Cookie', cookie)
      .send({ key: GEMINI_KEY });
    const listed = await request(ctx.app.getHttpServer())
      .get('/credentials')
      .set('Cookie', cookie);

    expect(JSON.stringify(saved.body)).not.toContain(GEMINI_KEY);
    expect(JSON.stringify(listed.body)).not.toContain(GEMINI_KEY);
    // Only the last four characters may appear anywhere.
    expect(JSON.stringify(listed.body)).toContain('f4Qa');
    expect(JSON.stringify(listed.body)).not.toContain(GEMINI_KEY.slice(0, 10));
  });

  it('stored_row_is_unreadable_without_the_master_key', async () => {
    validateMock.mockResolvedValue(valid());
    await request(ctx.app.getHttpServer())
      .put('/credentials/gemini')
      .set('Cookie', cookie)
      .send({ key: GEMINI_KEY });

    const rows = await ctx.prisma.$queryRaw<
      Array<{ ciphertext: Uint8Array; iv: Uint8Array; auth_tag: Uint8Array }>
    >`SELECT ciphertext, iv, auth_tag FROM user_credentials WHERE user_id = ${userId}::uuid`;

    const row = rows[0]!;
    expect(Buffer.from(row.ciphertext).toString('latin1')).not.toContain(GEMINI_KEY);
    // Three separate columns, as the PRD requires — not one blob.
    expect(row.iv).toHaveLength(12);
    expect(row.auth_tag).toHaveLength(16);
  });

  it('deleting_returns_the_provider_to_missing', async () => {
    validateMock.mockResolvedValue(valid());
    await request(ctx.app.getHttpServer())
      .put('/credentials/gemini')
      .set('Cookie', cookie)
      .send({ key: GEMINI_KEY });

    const deleted = await request(ctx.app.getHttpServer())
      .delete('/credentials/gemini')
      .set('Cookie', cookie);
    expect(deleted.status).toBe(204);

    const listed = await request(ctx.app.getHttpServer())
      .get('/credentials')
      .set('Cookie', cookie);
    const gemini = listed.body.data.find((e: { provider: string }) => e.provider === 'gemini');
    expect(gemini.status).toBe('missing');
    expect(gemini.maskedKey).toBeNull();
  });

  it('saving_twice_replaces_rather_than_duplicates', async () => {
    validateMock.mockResolvedValue(valid());

    await request(ctx.app.getHttpServer())
      .put('/credentials/gemini')
      .set('Cookie', cookie)
      .send({ key: GEMINI_KEY });
    await request(ctx.app.getHttpServer())
      .put('/credentials/gemini')
      .set('Cookie', cookie)
      .send({ key: 'AIzaSy-a-second-perfectly-good-key-abcd' });

    expect(await ctx.prisma.userCredential.count({ where: { userId } })).toBe(1);
    const row = await ctx.prisma.userCredential.findFirstOrThrow({ where: { userId } });
    expect(row.lastFour).toBe('abcd');
  });

  it('azure_requires_a_region', async () => {
    validateMock.mockResolvedValue(valid());

    const response = await request(ctx.app.getHttpServer())
      .put('/credentials/azure_speech')
      .set('Cookie', cookie)
      .send({ key: AZURE_KEY });

    // The database check constraint refuses provider=azure_speech with a null
    // region, so this fails even though the request schema allows it to be absent.
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await ctx.prisma.userCredential.count({ where: { userId } })).toBe(0);
  });

  it('azure_stores_its_region', async () => {
    validateMock.mockResolvedValue(valid());

    const response = await request(ctx.app.getHttpServer())
      .put('/credentials/azure_speech')
      .set('Cookie', cookie)
      .send({ key: AZURE_KEY, region: REGION });

    expect(response.status).toBe(200);
    expect(response.body.data.region).toBe(REGION);
  });

  it('revalidate_refreshes_status_and_timestamp', async () => {
    validateMock.mockResolvedValue({ status: 'unverified', providerMessage: 'unreachable' });
    await request(ctx.app.getHttpServer())
      .put('/credentials/gemini')
      .set('Cookie', cookie)
      .send({ key: GEMINI_KEY });

    validateMock.mockResolvedValue(valid());
    const response = await request(ctx.app.getHttpServer())
      .post('/credentials/gemini/revalidate')
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('valid');
  });

  it('revalidate_without_a_stored_key_returns_cred002', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/credentials/gemini/revalidate')
      .set('Cookie', cookie);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe(ERROR_CODES.CREDENTIAL_UNAVAILABLE);
  });

  it('credentials_are_scoped_to_their_owner', async () => {
    validateMock.mockResolvedValue(valid());
    await request(ctx.app.getHttpServer())
      .put('/credentials/gemini')
      .set('Cookie', cookie)
      .send({ key: GEMINI_KEY });

    const other = await ctx.prisma.user.create({
      data: {
        email: 'other@example.com',
        displayName: 'Other',
        passwordHash: await passwords.hash(PASSWORD),
      },
    });
    const otherCookie = await signIn(other.email);

    const listed = await request(ctx.app.getHttpServer())
      .get('/credentials')
      .set('Cookie', otherCookie);

    expect(listed.body.data.every((e: { status: string }) => e.status === 'missing')).toBe(true);
  });

  it('requires_a_session', async () => {
    const response = await request(ctx.app.getHttpServer()).get('/credentials');
    expect(response.status).toBe(401);
  });

  it('rejects_an_unknown_provider', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/credentials')
      .set('Cookie', cookie);
    expect(response.status).toBe(200);

    const bad = await request(ctx.app.getHttpServer())
      .put('/credentials/openai')
      .set('Cookie', cookie)
      .send({ key: GEMINI_KEY });
    expect(bad.status).toBe(400);
  });
});

describe('credential executor', () => {
  it('passes_the_decrypted_key_to_the_callback', async () => {
    validateMock.mockResolvedValue(valid());
    await request(ctx.app.getHttpServer())
      .put('/credentials/gemini')
      .set('Cookie', cookie)
      .send({ key: GEMINI_KEY });

    const executor = ctx.app.get(CredentialExecutorService);
    const received = await executor.withKey(userId, 'gemini', 'F02_test', async (c) => c.key);

    expect(received).toBe(GEMINI_KEY);
  });

  it('writes_an_audit_row_on_success', async () => {
    validateMock.mockResolvedValue(valid());
    await request(ctx.app.getHttpServer())
      .put('/credentials/gemini')
      .set('Cookie', cookie)
      .send({ key: GEMINI_KEY });

    await ctx.app
      .get(CredentialExecutorService)
      .withKey(userId, 'gemini', 'F11_lesson_analysis', async () => 'done');

    const rows = await ctx.prisma.credentialUsage.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: 'gemini',
      feature: 'F11_lesson_analysis',
      outcome: 'ok',
    });
  });

  it('writes_an_audit_row_on_provider_error_and_rethrows', async () => {
    validateMock.mockResolvedValue(valid());
    await request(ctx.app.getHttpServer())
      .put('/credentials/gemini')
      .set('Cookie', cookie)
      .send({ key: GEMINI_KEY });

    const executor = ctx.app.get(CredentialExecutorService);
    await expect(
      executor.withKey(userId, 'gemini', 'F11_lesson_analysis', async () => {
        throw Object.assign(new Error('boom'), { status: 500 });
      }),
    ).rejects.toThrow('boom');

    const rows = await ctx.prisma.credentialUsage.findMany({ where: { userId } });
    expect(rows[0]).toMatchObject({ outcome: 'provider_error', errorCode: 'HTTP_500' });
  });

  it('blocks_and_audits_when_the_credential_is_missing', async () => {
    const executor = ctx.app.get(CredentialExecutorService);
    const callback = vi.fn();

    await expect(
      executor.withKey(userId, 'gemini', 'F11_lesson_analysis', callback),
    ).rejects.toMatchObject({ code: ERROR_CODES.CREDENTIAL_UNAVAILABLE });

    expect(callback).not.toHaveBeenCalled();
    const rows = await ctx.prisma.credentialUsage.findMany({ where: { userId } });
    expect(rows[0]).toMatchObject({ outcome: 'blocked' });
  });

  it('blocks_when_the_credential_is_already_invalid', async () => {
    validateMock.mockResolvedValue(valid());
    await request(ctx.app.getHttpServer())
      .put('/credentials/gemini')
      .set('Cookie', cookie)
      .send({ key: GEMINI_KEY });
    await ctx.prisma.userCredential.updateMany({ where: { userId }, data: { status: 'invalid' } });

    const callback = vi.fn();
    await expect(
      ctx.app.get(CredentialExecutorService).withKey(userId, 'gemini', 'F11', callback),
    ).rejects.toMatchObject({ code: ERROR_CODES.CREDENTIAL_UNAVAILABLE });
    expect(callback).not.toHaveBeenCalled();
  });

  it('marks_the_credential_invalid_on_an_auth_error', async () => {
    validateMock.mockResolvedValue(valid());
    await request(ctx.app.getHttpServer())
      .put('/credentials/gemini')
      .set('Cookie', cookie)
      .send({ key: GEMINI_KEY });

    const executor = ctx.app.get(CredentialExecutorService);
    await expect(
      executor.withKey(userId, 'gemini', 'F11', async () => {
        throw Object.assign(new Error('API key not valid. Please pass a valid API key.'), {
          status: 400,
        });
      }),
    ).rejects.toThrow();

    const row = await ctx.prisma.userCredential.findFirstOrThrow({ where: { userId } });
    expect(row.status).toBe('invalid');

    // The next call blocks instead of burning quota against a dead key.
    const callback = vi.fn();
    await expect(executor.withKey(userId, 'gemini', 'F11', callback)).rejects.toMatchObject({
      code: ERROR_CODES.CREDENTIAL_UNAVAILABLE,
    });
    expect(callback).not.toHaveBeenCalled();
  });

  it('audit_rows_never_contain_key_material', async () => {
    validateMock.mockResolvedValue(valid());
    await request(ctx.app.getHttpServer())
      .put('/credentials/gemini')
      .set('Cookie', cookie)
      .send({ key: GEMINI_KEY });

    await ctx.app.get(CredentialExecutorService).withKey(userId, 'gemini', 'F11', async () => 1);

    const rows = await ctx.prisma.credentialUsage.findMany({ where: { userId } });
    expect(JSON.stringify(rows)).not.toContain(GEMINI_KEY);
  });
});
