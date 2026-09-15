import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { EnvValidationError, loadEnv } from '../../src/config/env';

const VALID_MASTER_KEY = randomBytes(32).toString('base64');

/** A complete, valid environment. Individual tests break one field at a time. */
function validEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    API_PORT: '3001',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db?schema=public',
    REDIS_URL: 'redis://localhost:6379',
    SESSION_SECRET: 'a'.repeat(48),
    BYOK_MASTER_KEY: VALID_MASTER_KEY,
    S3_ENDPOINT: 'http://localhost:9000',
    S3_ACCESS_KEY: 'minioadmin',
    S3_SECRET_KEY: 'minioadmin',
    S3_BUCKET: 'english-quest',
    LIVEKIT_URL: 'http://localhost:7880',
    LIVEKIT_WS_URL: 'ws://localhost:7880',
    LIVEKIT_API_KEY: 'devkey',
    LIVEKIT_API_SECRET: 'devsecret',
    ...overrides,
  } as NodeJS.ProcessEnv;
}

const SECRET_MESSAGE = 'SESSION_SECRET is missing or shorter than 32 characters.';

describe('loadEnv', () => {
  it('rejects_missing_session_secret', () => {
    expect(() => loadEnv(validEnv({ SESSION_SECRET: undefined }))).toThrow(EnvValidationError);

    try {
      loadEnv(validEnv({ SESSION_SECRET: undefined }));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as EnvValidationError).issues.join('\n')).toContain('SESSION_SECRET');
    }
  });

  it('rejects_short_session_secret', () => {
    // 31 characters — one short of the boundary.
    try {
      loadEnv(validEnv({ SESSION_SECRET: 'a'.repeat(31) }));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as EnvValidationError).issues.join('\n')).toContain(SECRET_MESSAGE);
    }
  });

  it('accepts_session_secret_at_the_boundary', () => {
    const config = loadEnv(validEnv({ SESSION_SECRET: 'a'.repeat(32) }));
    expect(config.SESSION_SECRET).toHaveLength(32);
  });

  it('rejects_missing_master_key', () => {
    try {
      loadEnv(validEnv({ BYOK_MASTER_KEY: undefined }));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as EnvValidationError).issues.join('\n')).toContain('BYOK_MASTER_KEY');
    }
  });

  it('rejects_a_master_key_that_is_not_32_bytes', () => {
    // Valid base64, wrong length — the shape that would otherwise fail much
    // later, at the first attempt to build an AES-256 cipher.
    const sixteenBytes = randomBytes(16).toString('base64');
    try {
      loadEnv(validEnv({ BYOK_MASTER_KEY: sixteenBytes }));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as EnvValidationError).issues.join('\n')).toContain('32 bytes of base64');
    }
  });

  it('rejects_malformed_seed_users', () => {
    try {
      loadEnv(validEnv({ SEED_USERS: 'not json at all' }));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as EnvValidationError).issues.join('\n')).toContain('SEED_USERS must be valid JSON');
    }
  });

  it('rejects_seed_users_failing_the_schema', () => {
    const payload = JSON.stringify([{ email: 'not-an-email', displayName: 'X', password: 'short' }]);
    try {
      loadEnv(validEnv({ SEED_USERS: payload }));
      expect.unreachable('should have thrown');
    } catch (error) {
      const issues = (error as EnvValidationError).issues.join('\n');
      expect(issues).toContain('SEED_USERS');
    }
  });

  it('parses_and_normalizes_seed_users', () => {
    const payload = JSON.stringify([
      { email: '  Miguel@Example.COM ', displayName: 'Miguel', password: 'longenoughpassword' },
    ]);
    const config = loadEnv(validEnv({ SEED_USERS: payload }));

    expect(config.SEED_USERS).toHaveLength(1);
    expect(config.SEED_USERS[0]?.email).toBe('miguel@example.com');
  });

  it('defaults_seed_users_to_empty_when_absent', () => {
    const config = loadEnv(validEnv({ SEED_USERS: undefined }));
    expect(config.SEED_USERS).toEqual([]);
  });

  it('accepts_complete_environment', () => {
    const config = loadEnv(validEnv());

    expect(config.NODE_ENV).toBe('test');
    expect(config.API_PORT).toBe(3001);
    expect(config.SESSION_TTL_SECONDS).toBe(604_800);
    expect(config.LOGIN_MAX_ATTEMPTS).toBe(5);
    expect(config.LOGIN_LOCKOUT_SECONDS).toBe(900);
    expect(config.S3_REGION).toBe('us-east-1');
    expect(config.LESSON_MAX_PARTICIPANTS).toBe(2);
  });

  it('rejects_missing_livekit_ws_url', () => {
    try {
      loadEnv(validEnv({ LIVEKIT_WS_URL: undefined }));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as EnvValidationError).issues.join('\n')).toContain('LIVEKIT_WS_URL');
    }
  });

  it('defaults_lesson_max_participants_to_two', () => {
    const config = loadEnv(validEnv({ LESSON_MAX_PARTICIPANTS: undefined }));
    expect(config.LESSON_MAX_PARTICIPANTS).toBe(2);
  });

  it('accepts_lesson_max_participants_up_to_four', () => {
    const config = loadEnv(validEnv({ LESSON_MAX_PARTICIPANTS: '4' }));
    expect(config.LESSON_MAX_PARTICIPANTS).toBe(4);
  });

  it('rejects_lesson_max_participants_below_two', () => {
    try {
      loadEnv(validEnv({ LESSON_MAX_PARTICIPANTS: '1' }));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as EnvValidationError).issues.join('\n')).toContain(
        'LESSON_MAX_PARTICIPANTS must be at least 2.',
      );
    }
  });

  it('rejects_lesson_max_participants_above_four', () => {
    try {
      loadEnv(validEnv({ LESSON_MAX_PARTICIPANTS: '5' }));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as EnvValidationError).issues.join('\n')).toContain(
        'LESSON_MAX_PARTICIPANTS must be at most 4.',
      );
    }
  });

  it('reports_every_problem_at_once', () => {
    try {
      loadEnv(validEnv({ SESSION_SECRET: 'short', DATABASE_URL: undefined, S3_BUCKET: undefined }));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as EnvValidationError).issues.length).toBeGreaterThanOrEqual(3);
    }
  });
});
