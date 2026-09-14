import { ERROR_CODES } from '@english-quest/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PasswordService } from '../../src/auth/password.service';
import { RedisService } from '../../src/redis/redis.service';
import { createTestContext, sessionTokenFrom, type TestContext } from './helpers/test-app';

const EMAIL = 'learner@example.com';
const PASSWORD = 'a perfectly fine password';

let ctx: TestContext;
const passwords = new PasswordService();

async function seedUser(email = EMAIL, password = PASSWORD): Promise<string> {
  const user = await ctx.prisma.user.create({
    data: {
      email,
      displayName: 'Learner',
      passwordHash: await passwords.hash(password),
    },
  });
  return user.id;
}

async function login(email = EMAIL, password = PASSWORD) {
  return request(ctx.app.getHttpServer()).post('/auth/login').send({ email, password });
}

beforeAll(async () => {
  ctx = await createTestContext();
}, 180_000);

afterAll(async () => {
  await ctx?.close();
});

beforeEach(async () => {
  await ctx.prisma.user.deleteMany();
  await ctx.app.get(RedisService).client.flushall();
});

describe('authentication', () => {
  it('login_success_sets_cookie', async () => {
    await seedUser();

    const response = await login();

    expect(response.status).toBe(200);
    expect(response.body.data.email).toBe(EMAIL);

    const setCookie = response.headers['set-cookie'] as unknown as string[];
    const header = setCookie.find((entry) => entry.startsWith('eq_session='));
    expect(header).toBeDefined();
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');

    const token = sessionTokenFrom(setCookie);
    expect(token).toBeTruthy();
  });

  it('login_wrong_password_returns_auth001', async () => {
    await seedUser();

    const response = await login(EMAIL, 'the wrong password');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe(ERROR_CODES.AUTH_INVALID_CREDENTIALS);
    expect(response.body.error.message).toBe('Incorrect email or password.');
  });

  it('login_unknown_email_is_indistinguishable', async () => {
    await seedUser();

    const wrongPassword = await login(EMAIL, 'the wrong password');
    await ctx.app.get(RedisService).client.flushall();
    const unknownEmail = await login('nobody@example.com', 'the wrong password');

    expect(unknownEmail.status).toBe(wrongPassword.status);
    expect(unknownEmail.body.error.code).toBe(wrongPassword.body.error.code);
    expect(unknownEmail.body.error.message).toBe(wrongPassword.body.error.message);

    // Timing: both paths run one bcrypt comparison at the same cost factor.
    const samples = 6;
    const timeOf = async (email: string): Promise<number> => {
      const started = process.hrtime.bigint();
      await login(email, 'the wrong password');
      await ctx.app.get(RedisService).client.flushall();
      return Number(process.hrtime.bigint() - started);
    };

    let knownTotal = 0;
    let unknownTotal = 0;
    for (let i = 0; i < samples; i += 1) {
      knownTotal += await timeOf(EMAIL);
      unknownTotal += await timeOf('nobody@example.com');
    }

    const ratio = Math.max(knownTotal, unknownTotal) / Math.min(knownTotal, unknownTotal);
    expect(ratio).toBeLessThan(1.5);
  }, 120_000);

  it('sixth_failure_locks_even_with_correct_password', async () => {
    await seedUser();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await login(EMAIL, 'the wrong password');
      expect(failed.status).toBe(401);
    }

    const locked = await login(EMAIL, PASSWORD);

    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe(ERROR_CODES.AUTH_LOCKED_OUT);
    expect(locked.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('lockout_clears_after_a_successful_login', async () => {
    await seedUser();

    await login(EMAIL, 'the wrong password');
    const ok = await login();
    expect(ok.status).toBe(200);

    const redis = ctx.app.get(RedisService);
    const keys = await redis.client.keys('login_fail:*');
    expect(keys).toHaveLength(0);
  });

  it('me_returns_current_user', async () => {
    await seedUser();
    const session = await login();
    const cookie = (session.headers['set-cookie'] as unknown as string[])[0]!;

    const response = await request(ctx.app.getHttpServer()).get('/auth/me').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.email).toBe(EMAIL);
    expect(new Date(response.body.data.sessionExpiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('me_without_cookie_returns_401', async () => {
    const response = await request(ctx.app.getHttpServer()).get('/auth/me');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe(ERROR_CODES.AUTH_SESSION_INVALID);
  });

  it('session_slides_on_each_request', async () => {
    await seedUser();
    const session = await login();
    const cookie = (session.headers['set-cookie'] as unknown as string[])[0]!;
    const token = sessionTokenFrom(session.headers['set-cookie'] as unknown as string[])!;

    const redis = ctx.app.get(RedisService);
    await redis.client.expire(RedisService.sessionKey(token), 100);
    const before = await redis.client.ttl(RedisService.sessionKey(token));

    await request(ctx.app.getHttpServer()).get('/auth/me').set('Cookie', cookie);

    const after = await redis.client.ttl(RedisService.sessionKey(token));
    expect(after).toBeGreaterThan(before);
  });

  it('logout_destroys_session_server_side', async () => {
    await seedUser();
    const session = await login();
    const cookie = (session.headers['set-cookie'] as unknown as string[])[0]!;
    const token = sessionTokenFrom(session.headers['set-cookie'] as unknown as string[])!;

    const redis = ctx.app.get(RedisService);
    // Prove the key exists first, or "it is gone afterwards" passes for the
    // wrong reason whenever the token is computed incorrectly.
    expect(await redis.client.get(RedisService.sessionKey(token))).not.toBeNull();

    const logout = await request(ctx.app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', cookie);
    expect(logout.status).toBe(204);

    expect(await redis.client.get(RedisService.sessionKey(token))).toBeNull();

    const reused = await request(ctx.app.getHttpServer()).get('/auth/me').set('Cookie', cookie);
    expect(reused.status).toBe(401);
  });

  it('deleted_user_session_returns_401', async () => {
    const userId = await seedUser();
    const session = await login();
    const cookie = (session.headers['set-cookie'] as unknown as string[])[0]!;
    const token = sessionTokenFrom(session.headers['set-cookie'] as unknown as string[])!;

    const redis = ctx.app.get(RedisService);
    expect(await redis.client.get(RedisService.sessionKey(token))).not.toBeNull();

    await ctx.prisma.user.delete({ where: { id: userId } });

    const response = await request(ctx.app.getHttpServer()).get('/auth/me').set('Cookie', cookie);

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Session no longer valid.');

    // The orphaned session is cleaned up rather than re-checked every request.
    expect(await redis.client.get(RedisService.sessionKey(token))).toBeNull();
  });

  it('password_change_requires_current_password', async () => {
    const userId = await seedUser();
    const session = await login();
    const cookie = (session.headers['set-cookie'] as unknown as string[])[0]!;

    const before = await ctx.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const response = await request(ctx.app.getHttpServer())
      .post('/auth/password')
      .set('Cookie', cookie)
      .send({ currentPassword: 'not my password', newPassword: 'a brand new password' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(ERROR_CODES.AUTH_WRONG_CURRENT_PASSWORD);

    const after = await ctx.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it('password_change_revokes_other_sessions', async () => {
    await seedUser();

    const first = await login();
    const firstCookie = (first.headers['set-cookie'] as unknown as string[])[0]!;
    const second = await login();
    const secondCookie = (second.headers['set-cookie'] as unknown as string[])[0]!;

    const changed = await request(ctx.app.getHttpServer())
      .post('/auth/password')
      .set('Cookie', secondCookie)
      .send({ currentPassword: PASSWORD, newPassword: 'a brand new password' });
    expect(changed.status).toBe(204);

    const caller = await request(ctx.app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', secondCookie);
    expect(caller.status).toBe(200);

    const evicted = await request(ctx.app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', firstCookie);
    expect(evicted.status).toBe(401);
  });

  it('rejects_invalid_login_payloads', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'not-an-email', password: 'short' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    expect(Array.isArray(response.body.error.details)).toBe(true);
  });

  it('no_registration_or_reset_routes_exist', async () => {
    const server = ctx.app.getHttpServer();

    expect((await request(server).post('/auth/register').send({})).status).toBe(404);
    expect((await request(server).post('/auth/password-reset').send({})).status).toBe(404);
    expect((await request(server).post('/auth/forgot-password').send({})).status).toBe(404);
  });

  it('directly_inserted_user_can_log_in', async () => {
    // No seed command involved: a plain insert is enough, which is what the
    // product promises about growing the group.
    await ctx.prisma.$executeRaw`
      INSERT INTO users (email, display_name, password_hash)
      VALUES (${'direct@example.com'}, ${'Direct'}, ${await passwords.hash(PASSWORD)})
    `;

    const response = await login('direct@example.com', PASSWORD);

    expect(response.status).toBe(200);
    expect(response.body.data.displayName).toBe('Direct');
  });

  it('rejects_uppercase_email_at_the_database_level', async () => {
    await expect(
      ctx.prisma.$executeRaw`
        INSERT INTO users (email, display_name, password_hash)
        VALUES (${'UPPER@example.com'}, ${'Upper'}, ${await passwords.hash(PASSWORD)})
      `,
    ).rejects.toThrow();
  });
});
